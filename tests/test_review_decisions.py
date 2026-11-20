from algorithm_engine.review_decisions import decide_review_batch

def row(id, start=9, end=10, room='LAB6', user='AK', faculty=None, semester='5', section='A', batch='', created=0, priority=1):
    return dict(id=id,start=start,end=end,room_id=room,user_id=user,faculty_ids=faculty or [user],semester=semester,section=section,batch=batch,created_at=created,base_priority=priority)

def test_static_bookings_are_protected_across_semesters():
    result=decide_review_batch([row('static',semester='1')],[row('new')],1)
    assert result['decisions'][0]['status']=='blocked'
    assert result['decisions'][0]['conflicts']==['static']
    assert not result['committed']

def test_fairness_includes_loser_and_waiting_changes_winner():
    pending=[row('old',user='AK',priority=1),row('new',user='SV',semester='3',created=5,priority=3)]
    result=decide_review_batch([],pending,5)
    assert result['decisions'][0]['status']=='recommended_pending_hod'
    assert result['jain_preview']==0.5
    assert result['peak_demand']['LAB6']==2

def test_distinct_batches_can_use_different_rooms_but_section_class_blocks_both():
    pending=[row('a1',batch='A1'),row('a2',room='LHC201',user='PS',batch='A2')]
    assert all(d['status']=='recommended_pending_hod' for d in decide_review_batch([],pending,0)['decisions'])
    result=decide_review_batch([row('whole',room='LHC306',user='DK')],pending,0)
    assert all(d['status']=='blocked' for d in result['decisions'])

def test_dp_beats_greedy_for_exclusive_room():
    requests=[row('long',9,12,user='A',priority=5),row('one',9,10,user='B',priority=3),row('two',10,12,user='C',priority=3)]
    dp=decide_review_batch([],requests,0,'dp')
    greedy=decide_review_batch([],requests,0,'greedy')
    assert [d['id'] for d in dp['decisions'] if d['status']=='recommended_pending_hod']==['one','two']
    assert [d['id'] for d in greedy['decisions'] if d['status']=='recommended_pending_hod']==['long']

def test_adjacent_bookings_and_empty_fairness():
    result=decide_review_batch([row('static',8,9)],[row('new')],0)
    assert result['decisions'][0]['status']=='recommended_pending_hod'
    assert decide_review_batch([],[],0)['jain_preview'] is None
