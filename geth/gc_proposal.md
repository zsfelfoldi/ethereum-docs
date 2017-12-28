## State trie GC proposal

This is my proposal for efficiently garbage collecting tries. It is low overhead and easy to maintain so hopefully not painful in the long term. In the short term it is a bit painful because it changes the database structure and also requires protocol change for fast sync (not for LES). Still I think it is manageable and I feel that this is the "right" way to store/access/reference trie nodes. It could also significantly increase both EVM and fast sync performance.

### Database format change

- old format: (trie node hash) -> (trie node)
- new format: (key prefix) (trie node hash) (creation block number) -> (trie node)
- new format for contract storage tries: (contract key) (storage key prefix) (trie node hash) (creation block number) -> (trie node)

Read access requires knowledge of the key prefix which is given during normal trie access (fast sync has to change a bit). 

### Fast sync protocol change

Instead of referencing by trie node hash, we should reference by state root (or block hash) and key prefix.

### GC method

An iterator scans around the state trie. Whenever it finds an entry that has been created before the actual GC block number, it reads the same key prefix from the state root at the GC block number. If the node just found is not referenced there then is should be deleted. Also, if there are multiple entries at the same key prefix with the same node hash but different creation block numbers that are not newer than the GC block number then only the latest of such entries should remain.

### Protocol and database transition

Database upgrade is possible but kind of slow, one alternative would be to handle both old and new tries for some time, allowing users to use their old db until they manage to fast sync again.
New database nodes can only serve new fast sync protocol but syncing new databases is possible with old protocol requests. Fast syncing old clients would only become hard/impossible when the majority of nodes has already switched to the new database format.