"""Pure-Python validation of SQL schema emitted by the TS sources.
This does not substitute for running the React Native app on Android/iOS.
"""
from pathlib import Path
import re
import sqlite3
import json
ROOT=Path(__file__).resolve().parent.parent


def main():
    core=(ROOT/'src/data/database.ts').read_text()
    setup=re.search(r'await conn\.execAsync\(`([\s\S]*?)`\);',core).group(1)
    main_db=sqlite3.connect(':memory:')
    main_db.executescript(setup)
    now=1760200000000
    main_db.execute('INSERT INTO decks(id,name,description,created_at,updated_at) VALUES(?,?,?,?,?)',('1','Default','',now,now))
    main_db.execute('INSERT INTO notes(id,guid,deck_id,type,front,back,tags,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',('n','guid','1','basic','Question','Answer','[]',now,now))
    main_db.execute('INSERT INTO cards(id,note_id,deck_id,ordinal,state,due,updated_at) VALUES(?,?,?,?,?,?,?)',('c','n','1',0,'new',now,now))
    main_db.execute('INSERT INTO review_logs(id,card_id,deck_id,timestamp,rating,elapsed_ms,prev_state,next_state,scheduled_days) VALUES(?,?,?,?,?,?,?,?,?)',('log','c','1',now,3,1000,'new','review',1))
    main_db.execute('INSERT INTO speed_sessions(id,active,updated_at,payload) VALUES(?,?,?,?)',('sprint',1,now,json.dumps({'selectedIds':['c'],'queue':['c'],'scores':{},'attempts':0})))
    assert main_db.execute('SELECT id FROM speed_sessions WHERE active=1').fetchone()==('sprint',)
    assert main_db.execute('SELECT c.id FROM cards c JOIN notes n ON n.id=c.note_id WHERE EXISTS (SELECT 1 FROM json_each(n.tags) t WHERE lower(t.value)=?)',('x',)).fetchall()==[]
    rows=main_db.execute('SELECT COUNT(*) FROM cards JOIN notes ON cards.note_id=notes.id').fetchone()
    assert rows==(1,)
    export=(ROOT/'src/services/importExport.ts').read_text()
    schema=re.search(r'await sql\.execAsync\(`([\s\S]*?)`\);',export).group(1)
    apkg=sqlite3.connect(':memory:');apkg.executescript(schema)
    apkg.execute('INSERT INTO col VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)', (1,0,0,0,11,0,0,0,'{}','{}','{}','{}','{}'))
    apkg.execute('INSERT INTO notes VALUES(?,?,?,?,?,?,?,?,?,?,?)',(100,'guid',200,0,0,' ','Question\x1fAnswer','Question',0,0,''))
    apkg.execute('INSERT INTO cards VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',(300,100,400,0,0,0,0,0,0,0,2500,0,0,0,0,0,0,''))
    apkg.execute('INSERT INTO revlog VALUES(?,?,?,?,?,?,?,?,?)',(now,300,-1,3,1,0,2500,1000,0))
    assert apkg.execute('SELECT count(*) FROM cards').fetchone()[0]==1
    print('SQLite and legacy Anki collection SQL smoke checks passed')

if __name__=='__main__': main()
