import copy
from concurrent.futures import ThreadPoolExecutor
import pytest
from pathlib import Path
from uuid import uuid4
from datetime import datetime
from algorithm_engine.campus_workflow import CampusWorkflow

ADMIN=dict(id='ADMIN',name='Admin',role='admin')
HOD=dict(id='HOD',name='HOD',role='hod')
AK=dict(id='AK',name='Amit K',role='faculty',facultyId='AK')
SV=dict(id='SV',name='Sneha V',role='faculty',facultyId='SV')
DK=dict(id='DK',name='Dheeraj K',role='faculty',facultyId='DK')
STUDENT=dict(id='PARTH',name='Parth',role='student',semester=5,section='A',batch='A1')
def row(id,day,start,end,faculty,room,semester='5',section='A',batch='',course='C1',kind='theory',rtype='classroom'):
    return dict(entry_id=id,day=day,start_time=start,end_time=end,branch='CSE-AI',semester=semester,section=section,batch=batch,course_code=course,course_name=course,session_type=kind,faculty_id=faculty,faculty_name=faculty,room_id=room,expected_students=24,room_type=rtype,room_capacity=60)
ROWS=[row('A','Mon','09:00','10:00','AK','R1'),row('B','Mon','10:15','11:15','SV','R1',course='C2'),row('C','Tue','09:00','10:00','DK','R2',semester='3'),row('D','Tue','11:15','13:15','AK','LAB6',batch='A1',course='DL',kind='lab',rtype='lab'),row('E','Wed','11:15','13:15','SV','LAB7',batch='A2',course='DL',kind='lab',rtype='lab'),row('F','Thu','09:00','10:00','AK','R3',semester='1'),row('G','Fri','09:00','10:00','AK','HALL',semester='7',kind='project',rtype='hall')]
@pytest.fixture
def tmp_path():
    # Windows restricted runtime cannot create pytest's private 0700 temp dirs.
    path=Path.cwd()/'data'/'local-publication'/('test-'+uuid4().hex)
    path.mkdir(parents=True)
    return path
@pytest.fixture
def engine(tmp_path):
    service=CampusWorkflow(str(tmp_path/'state.db'),clock=lambda:datetime.fromisoformat('2026-11-06T09:00:00+05:30'))
    service.execute(ADMIN,'upload_draft',dict(draft=dict(id='v1',rows=copy.deepcopy(ROWS))))
    service.execute(HOD,'publish',dict(publication=dict(id='v1',rows=copy.deepcopy(ROWS),approvedAt='2026-11-06T00:00:00Z')))
    return service
def view(engine,actor=HOD,date='2026-11-09'):
    return engine.execute(actor,'view',dict(date=date))
def request(engine,actor=AK,kind='reschedule',**extra):
    p=dict(kind=kind,source_id='A',date='2026-11-09',target_date='2026-11-10',start='10:15',end='11:15',room_id='R1',reason='Teaching adjustment for review')
    p.update(extra);return engine.execute(actor,'request',p)['id']
def find(engine,id):return next(r for r in view(engine)['requests'] if r['id']==id)

def test_reschedule_is_dated_requires_hod_and_persists(engine):
    id=request(engine)
    assert any(r['entry_id']=='A' for r in view(engine)['rows'])
    with pytest.raises(ValueError):engine.execute(AK,'approve',dict(id=id))
    engine.execute(HOD,'approve',dict(id=id))
    assert all(r['entry_id']!='A' for r in view(engine)['rows'])
    assert any(r['course_code']=='C1' and r['start_time']=='10:15' for r in view(engine,date='2026-11-10')['rows'])
    assert any(r['entry_id']=='A' for r in view(engine,date='2026-11-16')['rows'])
    assert CampusWorkflow(engine.filename).execute(HOD,'view',dict(date='2026-11-09'))['requests'][0]['status']=='approved'

def test_swap_consent_then_atomic_approval(engine):
    id=request(engine,kind='swap',partner_id='B',partner_date='2026-11-09')
    with pytest.raises(ValueError):engine.execute(HOD,'approve',dict(id=id))
    engine.execute(SV,'consent',dict(id=id,accept=True));engine.execute(HOD,'approve',dict(id=id))
    rows=view(engine)['rows'];assert next(r for r in rows if r['faculty_id']=='AK')['start_time']=='10:15'
    assert next(r for r in rows if r['faculty_id']=='SV')['start_time']=='09:00'

def test_consent_rejection_leaves_timetable_unchanged(engine):
    id=request(engine,kind='swap',partner_id='B')
    engine.execute(SV,'consent',dict(id=id,accept=False))
    assert find(engine,id)['status']=='rejected'
    assert {r['entry_id'] for r in view(engine)['rows']}=={'A','B'}

def test_final_recheck_rejects_conflicting_move_and_returns_alternatives(engine):
    id=request(engine,target_date='2026-11-09',start='10:15',end='11:15')
    assert find(engine,id)['alternatives']
    with pytest.raises(ValueError):engine.execute(HOD,'approve',dict(id=id))
    assert find(engine,id)['status']=='pending_hod'

def test_extra_class_fairness_protects_committed_winner(engine):
    first=request(engine,kind='extra_class',target_date='2026-11-09',start='15:00',end='16:00')
    second=request(engine,actor=SV,kind='extra_class',source_id='B',target_date='2026-11-09',start='15:00',end='16:00')
    with pytest.raises(ValueError):engine.execute(HOD,'approve',dict(id=first))
    engine.execute(HOD,'resolve',{})
    assert sorted([find(engine,first)['status'],find(engine,second)['status']])==['approved','waitlisted']
    assert view(engine)['fairness'][0]['jain']==0.5
    engine.execute(HOD,'resolve',{})
    assert len([r for r in view(engine)['requests'] if r['status']=='approved'])==1

def test_absence_then_eligible_coverage(engine):
    id=request(engine,kind='absence');engine.execute(HOD,'approve',dict(id=id))
    assert all(r['entry_id']!='A' for r in view(engine)['rows'])
    cover=request(engine,actor=DK,kind='cover')
    engine.execute(HOD,'approve',dict(id=cover))
    assert any(r['faculty_id']=='DK' for r in view(engine)['rows'])
    assert view(engine,STUDENT)['notifications']

def test_ineligible_substitute_is_rejected(engine):
    id=request(engine,kind='absence');engine.execute(HOD,'approve',dict(id=id))
    with pytest.raises(ValueError):request(engine,actor=SV,kind='cover')

def test_workstations_respect_parent_lab(engine):
    engine.execute(ADMIN,'inventory',dict(records=[dict(id='M5',parent='LAB6')]))
    id=request(engine,actor=STUDENT,kind='workstation',date='2026-11-10',start='11:15',end='12:15',room_id='M5')
    engine.execute(HOD,'resolve',{});assert find(engine,id)['status']=='waitlisted'
    free=request(engine,actor=STUDENT,kind='workstation',date='2026-11-09',start='15:00',end='16:00',room_id='M5')
    engine.execute(HOD,'resolve',{});assert find(engine,free)['status']=='approved'

def test_cancel_rechecks_restoration(engine):
    id=request(engine);engine.execute(HOD,'approve',dict(id=id))
    engine.execute(HOD,'cancel',dict(id=id))
    assert any(r['entry_id']=='A' for r in view(engine)['rows'])

def test_negotiate_requires_all_consent(engine):
    moves=[dict(source_id='A',date='2026-11-09',target_date='2026-11-09',start='13:30',end='14:30',room_id='R1'),dict(source_id='B',date='2026-11-09',target_date='2026-11-09',start='14:30',end='15:30',room_id='R1')]
    id=request(engine,kind='negotiate',moves=moves)
    engine.execute(SV,'consent',dict(id=id,accept=True));engine.execute(HOD,'approve',dict(id=id))
    assert sorted(r['start_time'] for r in view(engine)['rows'])==['13:30','14:30']

def test_student_cannot_move_teaching_sessions_or_publish(engine):
    with pytest.raises(ValueError):request(engine,actor=STUDENT)
    with pytest.raises(ValueError):engine.execute(STUDENT,'publish',dict(publication=dict(id='v2',rows=ROWS)))

def test_announcements_and_override_are_audited(engine):
    engine.execute(HOD,'announcement',dict(message='Department review tomorrow'))
    engine.execute(HOD,'override',dict(reason='Emergency room maintenance',affected=[dict(date='2026-11-09',source_id='A')]))
    assert all(r['entry_id']!='A' for r in view(engine)['rows'])
    assert view(engine,STUDENT)['announcements']
    assert view(engine)['audit'][-1]['action']=='override'

def test_two_reschedulers_cannot_double_book(engine):
    first=request(engine)
    second=request(engine,actor=SV,source_id='B')
    def approve(id):
        try:engine.execute(HOD,'approve',dict(id=id));return True
        except ValueError:return False
    with ThreadPoolExecutor(2) as pool: results=list(pool.map(approve,[first,second]))
    assert sum(results)==1

def test_room_capacity_is_checked_from_csv(engine):
    id=request(engine,room_id='R2')
    assert find(engine,id)['validation']=='Currently feasible'
    # The existing room has 60 seats. A separate bad publication must fail.
    bad=copy.deepcopy(ROWS);bad[0]['expected_students']=100
    service=CampusWorkflow(engine.filename+'-other')
    with pytest.raises(ValueError):service.execute(HOD,'publish',dict(publication=dict(id='bad',rows=bad)))

def test_official_ltp_rules_block_incorrect_publication_and_separate_batches(engine):
    rules=[dict(semester='5',section='A',course_code='DL',l_hours=0,t_hours=0,p_hours=2)]
    engine.execute(ADMIN,'course_rules',dict(records=rules))
    assert not view(engine)['course_compliance']['violations']
    rules[0]['p_hours']=3;engine.execute(ADMIN,'course_rules',dict(records=rules))
    engine.execute(ADMIN,'upload_draft',dict(draft=dict(id='v2',rows=ROWS)))
    with pytest.raises(ValueError,match='L:T:P'):engine.execute(HOD,'publish',dict(publication=dict(id='v2',rows=ROWS)))
    assert view(engine)['publication']['id']=='v1'

def test_individual_students_can_book_different_machines_concurrently(engine):
    engine.execute(ADMIN,'inventory',dict(records=[dict(id='M5',parent='LAB6'),dict(id='M6',parent='LAB6')]))
    second={**STUDENT,'id':'OTHER-STUDENT'}
    one=request(engine,actor=STUDENT,kind='workstation',date='2026-11-09',start='15:00',end='16:00',room_id='M5')
    two=request(engine,actor=second,kind='workstation',date='2026-11-09',start='15:00',end='16:00',room_id='M6')
    engine.execute(HOD,'resolve',{})
    assert find(engine,one)['status']==find(engine,two)['status']=='approved'
    assert all(not r.get('individual') or r['individual']=='PARTH' for r in view(engine,STUDENT)['rows'])

def test_all_day_absence_blocks_new_teaching_and_can_restore(engine):
    id=request(engine,kind='absence',all_day=True);engine.execute(HOD,'approve',dict(id=id))
    extra=request(engine,kind='extra_class',all_day=False,target_date='2026-11-09',start='15:00',end='16:00')
    engine.execute(HOD,'resolve',{})
    assert find(engine,extra)['status']=='waitlisted'
    engine.execute(HOD,'cancel',dict(id=id))
    assert any(r['entry_id']=='A' for r in view(engine)['rows'])

def test_force_release_and_allocation_is_one_transaction(engine):
    id=request(engine,kind='booking',date='2026-11-09',start='10:15',end='11:15',room_id='R1')
    assert find(engine,id)['validation']!='Currently feasible'
    engine.execute(HOD,'override',dict(reason='Emergency departmental examination',affected=[dict(date='2026-11-09',source_id='B')],request_id=id))
    assert find(engine,id)['status']=='approved'
    assert all(r['entry_id']!='B' for r in view(engine)['rows'])
    assert any(r['entry_id']=='B' for r in view(engine,date='2026-11-16')['rows'])

def test_invalid_force_allocation_rolls_back_cancellations(engine):
    id=request(engine,kind='booking',date='2026-11-09',start='10:15',end='11:15',room_id='R1')
    with pytest.raises(ValueError):engine.execute(HOD,'override',dict(reason='Emergency request with wrong release',affected=[dict(date='2026-11-09',source_id='A')],request_id=id))
    assert {r['entry_id'] for r in view(engine)['rows']}=={'A','B'}
    assert find(engine,id)['status']=='pending_hod'

def test_cannot_restore_absence_over_existing_coverage(engine):
    absence=request(engine,kind='absence');engine.execute(HOD,'approve',dict(id=absence))
    cover=request(engine,actor=DK,kind='cover');engine.execute(HOD,'approve',dict(id=cover))
    with pytest.raises(ValueError):engine.execute(HOD,'cancel',dict(id=absence))
    assert find(engine,absence)['status']=='approved'

def test_no_recurring_sessions_outside_term_and_statistics_follow_changes(engine):
    assert view(engine,date='2027-01-04')['rows']==[]
    before=view(engine)['utilization']['R1']
    id=request(engine,kind='extra_class',target_date='2026-11-09',start='15:00',end='16:00')
    engine.execute(HOD,'resolve',{})
    assert find(engine,id)['status']=='approved'
    assert view(engine)['utilization']['R1']>before

def test_longer_primary_class_can_be_negotiated_with_partner_consent(engine):
    moves=[dict(source_id='A',date='2026-11-09',target_date='2026-11-09',start='09:00',end='11:15',room_id='R1',extend=True),dict(source_id='B',date='2026-11-09',target_date='2026-11-09',start='13:30',end='14:30',room_id='R1')]
    id=request(engine,kind='negotiate',moves=moves);engine.execute(SV,'consent',dict(id=id,accept=True));engine.execute(HOD,'approve',dict(id=id))
    assert next(r for r in view(engine)['rows'] if r['faculty_id']=='AK')['additional_hours']==1.25

def test_request_retry_is_idempotent_and_reuse_with_different_data_fails(engine):
    first=request(engine,client_id='review-retry-1')
    second=request(engine,client_id='review-retry-1')
    assert first==second and len(view(engine)['requests'])==1
    with pytest.raises(ValueError):request(engine,client_id='review-retry-1',reason='Different body for same key')

def test_past_occurrences_are_rejected_and_pending_request_can_expire(engine):
    with pytest.raises(ValueError):request(engine,date='2026-11-02')
    id=request(engine)
    engine.clock=lambda:datetime.fromisoformat('2026-11-10T12:00:00+05:30')
    result=engine.execute(HOD,'approve',dict(id=id))
    assert 'expired' in result['message']
    assert find(engine,id)['status']=='expired'

def test_new_upload_invalidates_stale_hod_approval_without_losing_new_draft(engine):
    engine.execute(ADMIN,'upload_draft',dict(draft=dict(id='v2',rows=ROWS)))
    engine.execute(ADMIN,'upload_draft',dict(draft=dict(id='v3',rows=ROWS)))
    with pytest.raises(ValueError,match='draft changed'):engine.execute(HOD,'publish',dict(publication=dict(id='v2',rows=ROWS)))
    assert view(engine)['draft']['id']=='v3'
    assert view(engine)['publication']['id']=='v1'

def test_repeated_reschedule_and_dependency_safe_cancellation(engine):
    first=request(engine);engine.execute(HOD,'approve',dict(id=first))
    moved=next(r for r in view(engine,date='2026-11-10')['rows'] if r['start_time']=='10:15' and r['faculty_id']=='AK')
    second=request(engine,source_id=moved['entry_id'],date='2026-11-10',target_date='2026-11-11',start='09:00',end='10:00')
    engine.execute(HOD,'approve',dict(id=second))
    assert all(r['entry_id']!=moved['entry_id'] for r in view(engine,date='2026-11-10')['rows'])
    with pytest.raises(ValueError,match='dependent'):engine.execute(HOD,'cancel',dict(id=first))
    engine.execute(HOD,'cancel',dict(id=second));engine.execute(HOD,'cancel',dict(id=first))
    assert any(r['entry_id']=='A' for r in view(engine)['rows'])

def test_one_off_session_cannot_be_changed_as_if_it_recurred_next_week(engine):
    first=request(engine);engine.execute(HOD,'approve',dict(id=first))
    moved=next(r for r in view(engine,date='2026-11-10')['rows'] if r['start_time']=='10:15' and r['faculty_id']=='AK')
    with pytest.raises(ValueError,match='dated occurrence'):request(engine,source_id=moved['entry_id'],date='2026-11-17',target_date='2026-11-18')
