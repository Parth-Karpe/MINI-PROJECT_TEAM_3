"""Dated campus workflows, persisted atomically in SQLite.

E1: BEGIN IMMEDIATE serializes final recheck + commit across processes.
E2: reuse AVL interval indexes, priority aging and weighted interval scheduling.
E3: one durable state transaction (review adapter; Supabase adapter is separate).
All academic mutations require HOD; the weekly source is never edited by a
one-day exception. This service owns the effective schedule.
"""
import copy
import json
import sqlite3
from datetime import date, datetime, time, timedelta, timezone
from uuid import uuid4
import re
import hashlib
from threading import Lock,RLock
from .conflict_detection import IntervalTree
from .review_decisions import decide_review_batch
from .models import Allocation,Resource
from .optimization import utilization_report

TZ = timezone(timedelta(hours=5, minutes=30))
DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
_lock_registry={}
_registry_guard=Lock()

def _process_lock(filename):
    with _registry_guard:
        if filename not in _lock_registry:_lock_registry[filename]=RLock()
        return _lock_registry[filename]

def now(): return datetime.now(timezone.utc).isoformat()
def hours(day, value):
    return datetime.combine(date.fromisoformat(day), time.fromisoformat(value), TZ).timestamp()/3600
def duration(row): return hours('2026-01-01',row['end_time'])-hours('2026-01-01',row['start_time'])
def ids(row):
    return [x.strip().upper() for x in row.get('faculty_id','').replace('|',';').replace(',',';').split(';') if x.strip()]
def token(): return str(uuid4())

class CampusWorkflow:
    def __init__(self, filename, clock=None):
        self.filename=filename
        self.clock=clock or (lambda:datetime.now(TZ))
    def execute(self, actor, action, payload):
        if actor.get('role') not in ('admin','hod','faculty','student') or not actor.get('id'):
            raise ValueError('Authenticated identity required')
        # OS-inspired in-process mutex + DB transaction for cross-process safety.
        with _process_lock(self.filename),sqlite3.connect(self.filename,timeout=15) as db:
            db.execute('create table if not exists campus_state(id integer primary key check(id=1),body text not null)')
            db.execute('begin immediate')
            saved=db.execute('select body from campus_state where id=1').fetchone()
            state=json.loads(saved[0]) if saved else dict(publication=None,requests=[],exceptions=[],additions=[],resources={},notifications=[],audit=[],announcements=[])
            if action=='view': return self.view(state,actor,payload)
            result=self.mutate(state,actor,action,payload)
            state['audit'].append(dict(id=token(),actor=actor['id'],action=action,at=now(),request_id=payload.get('id')))
            db.execute('insert into campus_state(id,body) values(1,?) on conflict(id) do update set body=excluded.body',(json.dumps(state),))
            return result or {'ok':True}

    def check_date(self,s,value):
        d=date.fromisoformat(value)
        if not s['publication']: raise ValueError('Publish a timetable first')
        pub=s['publication']
        if value<pub['term_start'] or value>pub['term_end']: raise ValueError('Date is outside the approved term')
        if d.weekday()==6: raise ValueError('Sunday is not a working day')
        return d

    def effective(self,s,day):
        if not s['publication']: return []
        if day<s['publication']['term_start'] or day>s['publication']['term_end']:return []
        weekday=DAYS[date.fromisoformat(day).weekday()]
        rows=copy.deepcopy([r for r in s['publication']['rows'] if r['day']==weekday])
        exceptions={e['source_id'] for e in s['exceptions'] if e['date']==day}
        rows=[r for r in rows if r['entry_id'] not in exceptions]
        rows.extend(copy.deepcopy([a['row'] for a in s['additions'] if a['date']==day and a['row']['entry_id'] not in exceptions]))
        return rows

    def original(self,s,id):
        row=next((r for r in (s['publication'] or {}).get('rows',[]) if r['entry_id']==id),None)
        if not row:
            addition=next((a for a in s['additions'] if a['row']['entry_id']==id),None)
            if addition:row={**addition['row'],'_one_off_date':addition['date']}
        if not row: raise ValueError('Select a session from the published timetable')
        return copy.deepcopy(row)

    def validate_targets(self,s,removes,adds):
        trial=copy.deepcopy(s)
        for item in removes:
            if any(e['date']==item['date'] and e['source_id']==item['source_id'] for e in trial['exceptions']):
                raise ValueError('That occurrence has already changed. Refresh the timetable.')
            trial['exceptions'].append(item)
        for addition in adds:
            day=addition['date']; self.check_date(s,day); row=addition['row']
            try:
                if not all(isinstance(row[k],str) and re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d',row[k]) for k in ('start_time','end_time')):raise ValueError('Use HH:MM times')
                start,end=hours(day,row['start_time']),hours(day,row['end_time'])
            except (ValueError,TypeError): raise ValueError('Use valid HH:MM times')
            if end<=start or row['start_time']<'08:00' or row['end_time']>'17:00': raise ValueError('Session must fit 08:00–17:00 with positive duration')
            for absence in trial['requests']:
                if absence['kind']=='absence' and absence['status']=='approved' and absence['date']==day and absence.get('all_day') and absence['owner'].get('facultyId') in ids(row):
                    raise ValueError('Faculty is marked absent for this day')
            resource=s['resources'].get(row['room_id'])
            if not resource: raise ValueError('Resource is not in the imported inventory')
            if resource.get('capacity') and row.get('expected_students',0)>resource['capacity']: raise ValueError('Room capacity is too small')
            if row.get('session_type')=='lab' and resource.get('type') not in ('lab',None): raise ValueError('Lab session requires a lab')
            current=self.effective(trial,day)
            indexes={}
            def index(key):
                if key not in indexes: indexes[key]=IntervalTree()
                return indexes[key]
            for booked in current:
                bs,be=hours(day,booked['start_time']),hours(day,booked['end_time'])
                index('room:'+booked['room_id']).insert(bs,be,booked['entry_id'])
                for faculty in ids(booked): index('faculty:'+faculty).insert(bs,be,booked['entry_id'])
                if not booked.get('individual'):
                    index('students:'+str(booked['semester'])+':'+booked['section']+':'+(booked.get('batch') or '*')).insert(bs,be,booked['entry_id'])
                else:
                    index('person:'+booked['individual']).insert(bs,be,booked['entry_id'])
                    if not row.get('individual') and str(row['semester'])==str(booked['semester']) and row['section']==booked['section'] and (not row.get('batch') or not booked.get('batch') or row['batch']==booked['batch']):
                        index('individual-attendee').insert(bs,be,booked['entry_id'])
            conflicts=[]
            keys=['room:'+row['room_id']]+['faculty:'+f for f in ids(row)]
            base='students:'+str(row['semester'])+':'+row['section']+':'
            keys.extend([base+'*',base+row['batch']] if row.get('batch') else [base+'*',base+row['section']+'1',base+row['section']+'2'])
            if row.get('individual'): keys.append('person:'+row['individual'])
            else:keys.append('individual-attendee')
            # Whole-lab reservations and individual workstations are hierarchical.
            if resource.get('parent'): keys.append('room:'+resource['parent'])
            keys.extend('room:'+rid for rid,meta in s['resources'].items() if meta.get('parent')==row['room_id'])
            for key in keys:
                for overlap in index(key).query_overlaps(start,end): conflicts.append(f"{key} overlaps {overlap[2]}")
            if conflicts: raise ValueError('; '.join(sorted(set(conflicts))))
            trial['additions'].append(addition)
        return trial

    def notify(self,s,recipients,message):
        for recipient in sorted(set(recipients)):
            s['notifications'].append(dict(id=token(),recipient=recipient,message=message,at=now()))

    def target(self,row,day,start,end,room,request_id):
        clone=copy.deepcopy(row);clone.update(entry_id='CHANGE-'+request_id+'-'+token()[:6],day=DAYS[date.fromisoformat(day).weekday()],start_time=start,end_time=end,room_id=room,_one_off_date=day)
        return dict(date=day,row=clone)

    def plan(self,s,actor,p,request_id):
        kind=p.get('kind');day=p.get('date','');self.check_date(s,day)
        removes=[];adds=[];consents=set()
        if kind=='workstation':
            if actor['role']!='student': raise ValueError('Workstation booking is a student workflow')
            resource=s['resources'].get(p.get('room_id'))
            if not resource or resource.get('type')!='workstation': raise ValueError('Choose a registered workstation')
            row=dict(entry_id='WORK-'+request_id,day=DAYS[date.fromisoformat(day).weekday()],start_time=p.get('start'),end_time=p.get('end'),room_id=p['room_id'],semester=str(actor['semester']),section=actor['section'],batch=actor['batch'],course_code='SELF-STUDY',course_name='Individual lab work',session_type='project',faculty_id='',faculty_name='',expected_students=1,individual=actor['id'])
            if duration(row)>3:raise ValueError('Review policy: workstation bookings are limited to 3 hours')
            adds=[dict(date=day,row=row)]
        elif kind=='booking':
            if actor['role']!='faculty': raise ValueError('Faculty submits room/event requests')
            source=self.original(s,p.get('source_id'))
            if actor.get('facultyId') not in ids(source): raise ValueError('Choose your own teaching group')
            if p.get('expected_students') is not None:
                count=p['expected_students']
                if isinstance(count,bool) or not isinstance(count,int) or not 1<=count<=1000:raise ValueError('Participant count must be 1–1000')
                source['expected_students']=count
            source.update(course_name='Resource booking: '+p.get('reason',''),course_code='BOOKING',session_type='project')
            adds=[self.target(source,day,p.get('start'),p.get('end'),p.get('room_id'),request_id)]
        else:
            if actor['role']!='faculty': raise ValueError('Only faculty can request academic changes')
            source=self.original(s,p.get('source_id'))
            if DAYS[date.fromisoformat(day).weekday()]!=source['day']: raise ValueError('Source date must match the original session day')
            if source.get('_one_off_date') and source['_one_off_date']!=day:raise ValueError('This session exists only on its dated occurrence')
            if kind!='cover' and actor.get('facultyId') not in ids(source): raise ValueError('You do not teach the selected session')
            if kind in ('reschedule','swap','negotiate','absence'):
                removes.append(dict(date=day,source_id=source['entry_id']))
                consents.update(ids(source))
            if kind in ('reschedule','extra_class'):
                target_date=p.get('target_date') or day; self.check_date(s,target_date)
                new=self.target(source,target_date,p.get('start'),p.get('end'),p.get('room_id'),request_id)
                if kind=='reschedule' and abs(duration(new['row'])-duration(source))>0.001: raise ValueError('Preserve the original session duration')
                adds.append(new)
            elif kind=='swap':
                partner=self.original(s,p.get('partner_id'));partner_date=p.get('partner_date') or day;self.check_date(s,partner_date)
                if partner['entry_id']==source['entry_id'] and partner_date==day: raise ValueError('Choose a different occurrence')
                if DAYS[date.fromisoformat(partner_date).weekday()]!=partner['day']: raise ValueError('Partner date must match its session day')
                if partner.get('_one_off_date') and partner['_one_off_date']!=partner_date:raise ValueError('Partner session exists only on its dated occurrence')
                if abs(duration(source)-duration(partner))>0.001: raise ValueError('Direct swaps require equal session durations; use negotiated moves otherwise')
                removes.append(dict(date=partner_date,source_id=partner['entry_id']));consents.update(ids(partner))
                adds=[self.target(source,partner_date,partner['start_time'],partner['end_time'],p.get('room_id') or source['room_id'],request_id),self.target(partner,day,source['start_time'],source['end_time'],partner['room_id'],request_id)]
            elif kind=='negotiate':
                # Every displaced occurrence needs its own explicit replacement and consent.
                removes=[]
                for move in p.get('moves',[]):
                    row=self.original(s,move.get('source_id'));source_date=move.get('date');self.check_date(s,source_date)
                    if DAYS[date.fromisoformat(source_date).weekday()]!=row['day']: raise ValueError('A source date does not match its teaching day')
                    if row.get('_one_off_date') and row['_one_off_date']!=source_date:raise ValueError('A negotiated source has the wrong dated occurrence')
                    removes.append(dict(date=source_date,source_id=row['entry_id']));consents.update(ids(row))
                    new=self.target(row,move.get('target_date'),move.get('start'),move.get('end'),move.get('room_id'),request_id)
                    difference=duration(new['row'])-duration(row)
                    if abs(difference)>0.001:
                        if not move.get('extend') or actor.get('facultyId') not in ids(row) or difference<0:raise ValueError('Partner moves must preserve duration; explicitly mark your own longer session with extend=true')
                        new['row']['additional_hours']=difference
                    adds.append(new)
                if not 2<=len(adds)<=10 or not any(r['source_id']==source['entry_id'] and r['date']==day for r in removes): raise ValueError('Provide 2–10 replacement moves including your selected occurrence')
            elif kind=='cover':
                if not any(e['date']==day and e['source_id']==source['entry_id'] and e.get('absence') for e in s['exceptions']): raise ValueError('HOD must approve the absence first')
                eligible=any(r['course_code']==source['course_code'] and actor.get('facultyId') in ids(r) for r in s['publication']['rows'])
                if not eligible: raise ValueError('Only faculty already assigned this course can offer subject coverage. Use an extra class for your own subject.')
                if actor.get('facultyId') in ids(source):raise ValueError('An absent faculty member cannot cover their own absence')
                source.update(faculty_id=actor['facultyId'],faculty_name=actor['name'])
                adds=[self.target(source,day,source['start_time'],source['end_time'],source['room_id'],request_id)]
            elif kind=='absence' and p.get('all_day'):
                removes=[]
                for row in self.effective(s,day):
                    if row['day']==DAYS[date.fromisoformat(day).weekday()] and actor.get('facultyId') in ids(row):
                        removes.append(dict(date=day,source_id=row['entry_id']));consents.update(ids(row))
            elif kind!='absence': raise ValueError('Unknown request kind')
        if len({(r['date'],r['source_id']) for r in removes})!=len(removes): raise ValueError('An occurrence cannot be moved twice')
        consents.discard(actor.get('facultyId',''))
        for item in removes:
            if kind=='absence': item['absence']=True
        return removes,adds,{f:'pending' for f in consents}

    def alternatives(self,s,request):
        if not request['adds'] or len(request['adds'])!=1: return []
        source=request['adds'][0];row=source['row'];length=duration(row);result=[]
        for rid,resource in s['resources'].items():
            if resource.get('type')=='workstation' and not row.get('individual'): continue
            if row.get('individual') and resource.get('type')!='workstation': continue
            for start in ['08:00','09:00','10:15','11:15','13:30','14:30','15:45']:
                end_minutes=int((int(start[:2])+int(start[3:])/60+length)*60)
                if end_minutes>1020: continue
                end=f'{end_minutes//60:02}:{end_minutes%60:02}'
                if hours(source['date'],start)<self.clock().timestamp()/3600:continue
                addition=self.target(row,source['date'],start,end,rid,'alternative')
                try: self.validate_targets(s,request['removes'],[addition])
                except ValueError: continue
                result.append(dict(date=source['date'],room_id=rid,start=start,end=end))
                if len(result)==3:return result
        return result

    def commit(self,s,request,hod):
        if request['version']!=s['publication']['id']: raise ValueError('Request refers to a superseded timetable')
        if self.elapsed(s,request):raise ValueError('The requested occurrence has already started; submit a future request')
        if any(v!='accepted' for v in request['consents'].values()): raise ValueError('All affected faculty must consent first')
        trial=self.validate_targets(s,request['removes'],request['adds'])
        for e in trial['exceptions'][len(s['exceptions']):]: e['request_id']=request['id']
        for a in trial['additions'][len(s['additions']):]: a['request_id']=request['id']
        s['exceptions']=trial['exceptions'];s['additions']=trial['additions']
        request.update(status='approved',reviewed_at=now(),reviewed_by=hod['id'],decision='HOD approved after final AVL conflict and capacity check')
        recipients=self.recipients(s,request)
        self.notify(s,recipients,f"{request['kind']} approved for {request['date']}: {request['reason']}")
        if request['kind'] in ('absence','reschedule'):
            available=set()
            for occurrence in request['removes']:
                source=self.original(s,occurrence['source_id']);day=occurrence['date']
                candidates={f for row in s['publication']['rows'] if str(row['semester'])==str(source['semester']) and row['section']==source['section'] for f in ids(row)}
                for f in candidates- set(ids(source)):
                    index=IntervalTree()
                    for row in self.effective(s,day):
                        if f in ids(row):index.insert(hours(day,row['start_time']),hours(day,row['end_time']),row['entry_id'])
                    if not index.has_overlap(hours(day,source['start_time']),hours(day,source['end_time'])):available.add(f)
            self.notify(s,available,f"Released teaching period on {request['date']}; check the effective schedule before requesting it.")

    def recipients(self,s,request):
        recipients=[request['owner']['id']]+list(request['consents'])
        rows=[self.original(s,e['source_id']) for e in request['removes']]+[a['row'] for a in request['adds']]
        for row in rows:
            recipients.extend(ids(row))
            if row.get('individual'):recipients.append(row['individual'])
            else:recipients.append(f"group:{row['semester']}:{row['section']}:{row.get('batch') or '*'}")
        return recipients

    def mutate(self,s,actor,action,p):
        role=actor['role']
        if action=='upload_draft':
            if role!='admin':raise ValueError('Only Admin uploads drafts')
            draft=p.get('draft')
            if not isinstance(draft,dict) or not draft.get('id') or not 1<=len(draft.get('rows',[]))<=2000:raise ValueError('Invalid timetable draft')
            s['draft']=copy.deepcopy(draft)
            self.notify(s,['hod'],'A timetable draft is ready for review')
        elif action=='publish':
            if role!='hod': raise ValueError('Only HOD can publish')
            publication=p.get('publication');rows=publication.get('rows',[]) if isinstance(publication,dict) else []
            if not rows: raise ValueError('Timetable is empty')
            if s['publication'] and s['publication']['id']==publication['id']: return {'ok':True}
            if not s.get('draft') or s['draft']['id']!=publication['id']:raise ValueError('The draft changed. Refresh and review the current draft.')
            if rows!=s['draft']['rows']:raise ValueError('Publication rows differ from the reviewed draft')
            if any(r['status']=='approved' for r in s['requests']): raise ValueError('Active dynamic allocations exist. Finish this term before replacing the base timetable.')
            # Validate every weekly row using the same conflict index used at commit.
            publication=copy.deepcopy(publication);publication.update(term_start=p.get('term_start','2026-09-07'),term_end=p.get('term_end','2026-12-29'))
            date.fromisoformat(publication['term_start']);date.fromisoformat(publication['term_end'])
            if publication['term_end']<publication['term_start']: raise ValueError('Invalid term dates')
            resources={}
            for row in rows:
                rid=row['room_id'];meta=resources.setdefault(rid,dict(id=rid,type=None,capacity=None,building=None,parent=None))
                for field,target in [('room_type','type'),('room_capacity','capacity'),('building','building')]:
                    value=row.get(field)
                    if value:
                        if meta[target] and meta[target]!=value: raise ValueError('Inconsistent resource metadata')
                        meta[target]=value
            sandbox=dict(publication={**publication,'rows':[]},resources=resources,requests=[],exceptions=[],additions=[])
            monday=date.fromisoformat(publication['term_start'])
            while monday.weekday()!=0:monday+=timedelta(days=1)
            if monday+timedelta(days=5)>date.fromisoformat(publication['term_end']): raise ValueError('Term must contain a full teaching week')
            additions=[dict(date=(monday+timedelta(days=DAYS.index(r['day']))).isoformat(),row=r) for r in rows]
            self.validate_targets(sandbox,[],additions)
            compliance=self.course_compliance(rows,s.get('course_rules',[]))
            if compliance['violations']:raise ValueError('L:T:P: '+'; '.join(compliance['violations']))
            s['publication']=publication;s['draft']=None;s['resources']=resources;s['exceptions']=[];s['additions']=[]
            for r in s['requests']:
                if r['status'] in ('pending_hod','pending_consent','waitlisted'):r['status']='expired'
            self.notify(s,['students','faculty'],'HOD published the department timetable')
        elif action=='inventory':
            if role!='admin': raise ValueError('Only Admin imports workstations')
            records=p.get('records',[])
            if not 1<=len(records)<=500: raise ValueError('Import 1–500 workstations')
            seen=set()
            for r in records:
                if not isinstance(r.get('id'),str) or not r['id'] or r['id'] in s['resources'] or r['id'] in seen: raise ValueError('Workstation IDs must be unique and new')
                parent=s['resources'].get(r.get('parent'))
                if not parent or parent.get('type')!='lab': raise ValueError('Workstation parent must be a CSV-verified lab')
                seen.add(r['id'])
            for r in records:s['resources'][r['id']]=dict(id=r['id'],parent=r['parent'],type='workstation',capacity=1,building=s['resources'][r['parent']].get('building'))
        elif action=='course_rules':
            if role!='admin':raise ValueError('Only Admin imports official L:T:P rules')
            records=p.get('records',[])
            if not 1<=len(records)<=500:raise ValueError('Import 1–500 course rules')
            keys=set()
            for rule in records:
                if str(rule.get('semester')) not in ('1','3','5','7') or rule.get('section') not in ('A','B') or not rule.get('course_code'):raise ValueError('Course rule needs semester, section and course code')
                for field in ('l_hours','t_hours','p_hours'):
                    number=rule.get(field)
                    if isinstance(number,bool) or not isinstance(number,(int,float)) or not 0<=number<=54:raise ValueError('L:T:P values must be weekly contact hours between 0 and 54')
                key=(str(rule['semester']),rule['section'],rule['course_code'])
                if key in keys:raise ValueError('Duplicate course rule')
                keys.add(key)
            s['course_rules']=records
        elif action=='request':
            if role not in ('faculty','student'): raise ValueError('Faculty or student request required')
            client_id=p.get('client_id')
            digest=hashlib.sha256(json.dumps({k:v for k,v in p.items() if k!='client_id'},sort_keys=True).encode()).hexdigest()
            if client_id:
                if not isinstance(client_id,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,80}',client_id):raise ValueError('Invalid idempotency key')
                previous=next((r for r in s['requests'] if r.get('client_id')==client_id and r['owner']['id']==actor['id']),None)
                if previous:
                    if previous.get('payload_digest')!=digest:raise ValueError('Idempotency key was reused with different request data')
                    return dict(ok=True,id=previous['id'],validation=previous['validation'],alternatives=previous.get('alternatives',[]))
            if not isinstance(p.get('reason'),str) or not 3<=len(p['reason'])<=1000:raise ValueError('Provide a reason (3–1000 characters)')
            if len([r for r in s['requests'] if r['owner']['id']==actor['id'] and r['status'] in ('pending_hod','pending_consent','waitlisted')])>=30:raise ValueError('Too many active requests')
            id=token();removes,adds,consents=self.plan(s,actor,p,id)
            r=dict(id=id,owner=actor,kind=p['kind'],date=p['date'],reason=p['reason'],version=s['publication']['id'],removes=removes,adds=adds,consents=consents,status='pending_consent' if consents else 'pending_hod',created_at=now(),priority=3 if role=='faculty' else 1)
            r['all_day']=bool(p.get('all_day'))
            r.update(client_id=client_id,payload_digest=digest)
            if self.elapsed(s,r):raise ValueError('Choose future occurrences; a requested session has already started')
            try:self.validate_targets(s,removes,adds);r['validation']='Currently feasible'
            except ValueError as e:r['validation']=str(e)
            r['alternatives']=self.alternatives(s,r) if r['validation']!='Currently feasible' else []
            s['requests'].append(r);self.notify(s,list(consents)+['hod'],f"New {r['kind']} request {id[:8]}")
            return {'ok':True,'id':id,'validation':r['validation'],'alternatives':r['alternatives']}
        elif action in ('consent','approve','reject','cancel'):
            r=next((r for r in s['requests'] if r['id']==p.get('id')),None)
            if not r:raise ValueError('Request not found')
            if action=='consent':
                faculty=actor.get('facultyId')
                if role!='faculty' or faculty not in r['consents'] or r['status']!='pending_consent':raise ValueError('No consent is pending for this account')
                if p.get('accept') is not True:
                    r['consents'][faculty]='rejected';r['status']='rejected';r['decision']='Affected faculty rejected the proposal'
                else:
                    r['consents'][faculty]='accepted'
                    if all(v=='accepted' for v in r['consents'].values()):r['status']='pending_hod'
                self.notify(s,[r['owner']['id'],'hod'],'Faculty consent updated for '+r['id'][:8])
            elif action=='approve':
                if role!='hod' or r['status'] not in ('pending_hod','waitlisted'):raise ValueError('Only HOD can approve a ready request')
                if self.elapsed(s,r):
                    r.update(status='expired',decision='Occurrence started before approval')
                    return dict(ok=True,message='Request expired because its occurrence has started.')
                if r['kind'] in ('extra_class','booking','workstation'):raise ValueError('Use Resolve competing bookings so priority and fairness are applied together')
                self.commit(s,r,actor)
            elif action=='reject':
                if role!='hod' or r['status'] not in ('pending_hod','pending_consent','waitlisted'):raise ValueError('Only HOD can reject an active request')
                r.update(status='rejected',decision=str(p.get('reason') or 'Rejected by HOD'))
                self.notify(s,[r['owner']['id']],r['decision'])
            else:
                if actor['id']!=r['owner']['id'] and role!='hod':raise ValueError('Only requester or HOD may cancel')
                if r['status'] in ('cancelled','rejected','expired'):raise ValueError('Request is already closed')
                if r['status']=='approved':
                    if role!='hod':raise ValueError('Approved changes require HOD cancellation')
                    produced={a['row']['entry_id'] for a in r['adds']}
                    if any(other['id']!=r['id'] and other['status']=='approved' and any(e['source_id'] in produced for e in other['removes']) for other in s['requests']):raise ValueError('Cancel dependent changes first, then restore this earlier change')
                    restored=copy.deepcopy(s);restored['exceptions']=[e for e in restored['exceptions'] if e.get('request_id')!=r['id']];restored['additions']=[a for a in restored['additions'] if a.get('request_id')!=r['id']]
                    # Restore original occurrences only if no newer allocation conflicts.
                    adds=[dict(date=e['date'],row=self.original(s,e['source_id'])) for e in r['removes']]
                    # Temporarily remove originals from effective view, then validate restoration.
                    probe=copy.deepcopy(restored);probe['exceptions'].extend(r['removes'])
                    for restored_request in probe['requests']:
                        if restored_request['id']==r['id']:restored_request['status']='cancelled'
                    self.validate_targets(probe,[],adds)
                    s['exceptions']=restored['exceptions'];s['additions']=restored['additions']
                r['status']='cancelled';self.notify(s,self.recipients(s,r),'Request cancelled: '+r['id'][:8])
        elif action=='resolve':
            if role!='hod':raise ValueError('Only HOD resolves allocation batches')
            eligible=[]
            for r in s['requests']:
                if r['kind'] not in ('extra_class','booking','workstation') or r['status'] not in ('pending_hod','waitlisted'):continue
                if self.elapsed(s,r):r.update(status='expired',decision='Occurrence started before allocation');continue
                try:self.validate_targets(s,r['removes'],r['adds'])
                except ValueError as e:r.update(status='waitlisted',decision=str(e),alternatives=self.alternatives(s,r));continue
                eligible.append(r)
            dayset={a['date'] for r in eligible for a in r['adds']}
            bookings=[]
            def normalized(row,day,id,user='static',priority=1,created=0):
                return dict(id=id,start=hours(day,row['start_time']),end=hours(day,row['end_time']),room_id=row['room_id'],user_id=user,faculty_ids=ids(row),semester='individual' if row.get('individual') else str(row['semester']),section=row.get('individual') or row['section'],batch='' if row.get('individual') else row.get('batch') or '',base_priority=priority,created_at=created)
            for day in dayset:
                for row in self.effective(s,day):bookings.append(normalized(row,day,day+':'+row['entry_id']))
            pending=[normalized(r['adds'][0]['row'],r['adds'][0]['date'],r['id'],r['owner']['id'],r['priority'],datetime.fromisoformat(r['created_at']).timestamp()/3600) for r in eligible]
            report=decide_review_batch(bookings,pending,datetime.now(timezone.utc).timestamp()/3600,'dp',0.5)
            traces={d['id']:d for d in report['decisions']}
            for r in eligible:
                trace=traces[r['id']];r['algorithm_trace']=trace
                if trace['status']=='recommended_pending_hod':
                    try:self.commit(s,r,actor)
                    except ValueError as e:r.update(status='waitlisted',decision=str(e))
                else:r.update(status='waitlisted',decision='Lost this weighted allocation batch; approved bookings remain protected',alternatives=self.alternatives(s,r))
            return {'ok':True,'report':report}
        elif action=='announcement':
            if role!='hod':raise ValueError('Only HOD can publish announcements')
            message=p.get('message','').strip()
            if not 3<=len(message)<=2000:raise ValueError('Announcement must be 3–2000 characters')
            s['announcements'].append(dict(id=token(),message=message,at=now()))
            self.notify(s,['students','faculty'],message)
        elif action=='override':
            if role!='hod':raise ValueError('Only HOD may force a dated change')
            reason=p.get('reason','').strip()
            if len(reason)<10:raise ValueError('Override needs a detailed reason')
            affected=p.get('affected',[])
            # Explicit cancellation list is visible in UI; no silent preemption.
            if not affected:raise ValueError('Select the exact static occurrences to cancel')
            removes=[]
            for item in affected:
                self.check_date(s,item['date']);row=self.original(s,item['source_id'])
                if DAYS[date.fromisoformat(item['date']).weekday()]!=row['day']:raise ValueError('Override date does not match session')
                removes.append(dict(date=item['date'],source_id=row['entry_id'],override_reason=reason))
            override_id=token()
            for occurrence in removes:occurrence['request_id']=override_id
            trial=self.validate_targets(s,removes,[])
            if p.get('request_id'):
                target=next((r for r in trial['requests'] if r['id']==p['request_id']),None)
                if not target or target['status'] not in ('pending_hod','waitlisted'):raise ValueError('Choose an existing consent-complete pending request')
                self.commit(trial,target,actor)
                target['decision']='HOD emergency allocation after explicitly cancelling selected static occurrences: '+reason
            trial['requests'].append(dict(id=override_id,owner=actor,kind='override',date=removes[0]['date'],reason=reason,version=s['publication']['id'],removes=removes,adds=[],consents={},status='approved',created_at=now(),priority=5,validation='Explicit HOD exception',decision='Static occurrences cancelled by HOD; restore only after checking dependent allocations'))
            s.update(trial)
            self.notify(s,self.recipients(s,dict(owner=actor,consents={},removes=removes,adds=[])),'HOD dated override: '+reason)
        else:raise ValueError('Unknown workflow action')

    def view(self,s,actor,p):
        role=actor['role'];day=p.get('date') or datetime.now(TZ).date().isoformat()
        date.fromisoformat(day)
        rows=self.effective(s,day)
        personal=rows
        if role=='faculty':personal=[r for r in rows if actor.get('facultyId') in ids(r)]
        if role=='student':personal=[r for r in rows if (not r.get('individual') and str(r['semester'])==str(actor.get('semester')) and r['section']==actor.get('section') and (not r.get('batch') or r['batch']==actor.get('batch'))) or r.get('individual')==actor['id']]
        requests=[r for r in s['requests'] if role in ('admin','hod') or r['owner']['id']==actor['id'] or actor.get('facultyId') in r['consents']]
        recipients=[actor['id'],actor.get('facultyId'),role,role+'s']
        if role=='student':recipients.extend([f"group:{actor['semester']}:{actor['section']}:*",f"group:{actor['semester']}:{actor['section']}:{actor['batch']}"])
        notifications=[n for n in s['notifications'] if n['recipient'] in recipients]
        fairness={}
        for r in s['requests']:
            if r['version']!=(s['publication'] or {}).get('id') or r['kind'] not in ('extra_class','booking','workstation') or not r.get('algorithm_trace'):continue
            for a in r['adds']:
                dayvalue=date.fromisoformat(a['date']);week=(dayvalue-timedelta(days=dayvalue.weekday())).isoformat();key=week+' / '+a['row']['room_id']
                shares=fairness.setdefault(key,{})
                shares.setdefault(r['owner']['id'],0)
                if r['status']=='approved':shares[r['owner']['id']]+=duration(a['row'])
        measurements=[]
        for key,shares in fairness.items():
            values=list(shares.values());denom=len(values)*sum(v*v for v in values)
            measurements.append(dict(resource_week=key,hours=shares,jain=round(sum(values)**2/denom,3) if denom else None))
        # Free-room search never exposes other people's class details.
        availability=[]
        start=p.get('start','15:00');end=p.get('end','16:00')
        for rid,meta in s['resources'].items():
            if role=='student' and meta.get('type') not in ('classroom','workstation'):continue
            if hours(day,end)<=hours(day,start):continue
            test=dict(entry_id='SEARCH',start_time=start,end_time=end,day=DAYS[date.fromisoformat(day).weekday()],room_id=rid,faculty_id='',faculty_name='',semester=str(actor.get('semester',5)),section=actor.get('section','A'),batch=actor.get('batch',''),expected_students=0,session_type='project')
            if role=='student':test['individual']=actor['id']
            try:self.validate_targets(s,[],[dict(date=day,row=test)])
            except ValueError:continue
            availability.append(meta)
        weekly=copy.deepcopy((s['publication'] or {}).get('rows',[]))
        catalog=weekly
        if role=='faculty':
            groups={(str(r['semester']),r['section']) for r in weekly if actor.get('facultyId') in ids(r)}
            courses={r['course_code'] for r in weekly if actor.get('facultyId') in ids(r)}
            absent={e['source_id'] for e in s['exceptions'] if e['date']==day and e.get('absence')}
            catalog=[r for r in weekly if (str(r['semester']),r['section']) in groups or (r['entry_id'] in absent and r['course_code'] in courses)]
            weekly=[r for r in weekly if actor.get('facultyId') in ids(r)]
            known={r['entry_id'] for r in catalog}
            catalog+= [r for r in rows if r['entry_id'] not in known and ((str(r['semester']),r['section']) in groups or actor.get('facultyId') in ids(r))]
        elif role=='student':
            weekly=[r for r in weekly if str(r['semester'])==str(actor.get('semester')) and r['section']==actor.get('section') and (not r.get('batch') or r['batch']==actor.get('batch'))];catalog=[]
        info={k:v for k,v in (s['publication'] or {}).items() if k!='rows'}
        weekly_occupancy=[{k:r[k] for k in ('day','start_time','end_time','room_id','session_type')} for r in (s['publication'] or {}).get('rows',[])]
        stats={};workload={}
        if role in ('hod','admin') and s['publication']:
            monday=date.fromisoformat(day)-timedelta(days=date.fromisoformat(day).weekday());days=[(monday+timedelta(days=i)).isoformat() for i in range(6)]
            days=[d for d in days if s['publication']['term_start']<=d<=s['publication']['term_end']]
            resources={rid:Resource(rid,rid,meta.get('type') or 'unknown',capacity=1) for rid,meta in s['resources'].items()}
            for d in days:
                allocations=[]
                for row in self.effective(s,d):
                    allocations.append(Allocation(row['entry_id'],'schedule',row['room_id'],hours(d,row['start_time']),hours(d,row['end_time'])))
                    for f in ids(row):workload[f]=workload.get(f,0)+duration(row)
                report=utilization_report(allocations,resources,hours(d,'08:00'),hours(d,'17:00'))
                for rid,percentage in report.items():stats[rid]=stats.get(rid,0)+percentage/len(days)
        compliance=self.course_compliance((s['publication'] or {}).get('rows',[]),s.get('course_rules',[]))
        return dict(draft=s.get('draft') if role in ('admin','hod') else None,course_compliance=compliance if role in ('admin','hod') else None,utilization=stats,faculty_hours=workload,weekly_occupancy=weekly_occupancy,weekly_rows=weekly,catalog=catalog,approved_info=info,date=day,rows=personal,requests=requests,resources=list(s['resources'].values()),available=availability,notifications=notifications[-100:],announcements=s['announcements'][-20:],fairness=measurements if role in ('hod','admin') else [],audit=s['audit'][-100:] if role in ('hod','admin') else [],publication=s['publication'] if role in ('admin','hod') else None,published=bool(s['publication']))

    def course_compliance(self,rows,rules):
        violations=[];checks=[]
        covered={(str(r['semester']),r['section'],r['course_code']) for r in rules}
        missing=sorted(f"S{sem} {section} {course}" for sem,section,course in {(str(r['semester']),r['section'],r['course_code']) for r in rows if r['session_type']!='project'}-covered)
        for rule in rules:
            selected=[r for r in rows if str(r['semester'])==str(rule['semester']) and r['section']==rule['section'] and r['course_code']==rule['course_code']]
            batches={r.get('batch') for r in selected if r.get('batch')} or {None}
            # Parallel batch hours are checked separately, never added together.
            if batches:batches.update({r.get('batch') for r in rows if str(r['semester'])==str(rule['semester']) and r['section']==rule['section'] and r.get('batch')})
            for batch in batches:
                actual=[sum(duration(r) for r in selected if r['session_type']==kind and (not r.get('batch') or r['batch']==batch)) for kind in ('theory','tutorial','lab')]
                expected=[rule[k] for k in ('l_hours','t_hours','p_hours')]
                label=f"S{rule['semester']} {rule['section']}/{batch or 'all'} {rule['course_code']}"
                checks.append(dict(label=label,required=expected,scheduled=actual))
                if any(abs(a-b)>0.001 for a,b in zip(actual,expected)):violations.append(f"{label}: required {expected}, scheduled {actual}")
        return dict(violations=violations,checks=checks,missing_requirements=missing,certified=bool(rows) and not violations and not missing)

    def elapsed(self,s,request):
        instants=[hours(a['date'],a['row']['start_time']) for a in request['adds']]
        instants.extend(hours(e['date'],self.original(s,e['source_id'])['start_time']) for e in request['removes'])
        return any(value<self.clock().timestamp()/3600 for value in instants)
