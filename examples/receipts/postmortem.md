## Root cause

The connection pool exhausted under sustained load.[^e1] The team acknowledges
the read replica was overdue for rotation.[^e2] Every engineer on the team
independently flagged connection pooling as the top risk.[^e3]

[^e1]: "the connection pool exhausted after roughly 4 minutes under load" — sources/incident-log.txt
[^e2]: "we hadn't rotated the read replica in over a year, which is honestly on us" — sources/incident-log.txt
[^e3]: "connection pooling is our biggest risk" — sources/incident-log.txt
