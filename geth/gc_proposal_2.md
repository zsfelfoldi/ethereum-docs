## State trie GC proposal 2

This GC scheme proposal is somewhat related to my first proposal https://gist.github.com/zsfelfoldi/5c4f36fb8a898acd092a62dea4336f88 but it is also closer to the reference counting approach because it does not duplicate trie nodes just stores extra reference data. Instead of just counting references to nodes, it actually stores all refs which is still not a big overhead but greatly simplifies GC process. Iterating through the old tries is not necessary, we can just scan the db and remove expired refs and data. Since nodes are still referenced by hash there is also no need to modify the fast sync protocol.

Note: I still believe that reorganizing nodes by position (as it happens in my first proposal) might yield some performance improvements but on the other hand if we can keep most of the state in memory then this is not really relevant. This GC variant is definitely easier and safer to implement.

### Database format

- Trie nodes are stored as they are now: `trie node hash` -> `trie node`
- Contract codes too: `contract code hash` -> `contract code`
- Reference entries are empty db entries: `trie node/contract code hash`+`position`+`age` -> NULL

Note: since adding ref entries will require a db upgrade/resync anyway, I'd recommend adding a db key prefix for the state trie to make iterating over it easier.

For state trie entries `position` is the key prefix with an encoding that can encode odd nibble lengths too. For contract storage tries it is contract key + storage key prefix. For contract codes it is the contract key itself (maybe with some extra bytes that makes these three cases always distinguishable).

Ref entries are added when a node or code appears at a given position at a given block number (`age`). While it is unchanged, no further entries are added. If it disappears in a subsequent block, still no change is required but if it reappears at the same `position` later, a new entry is required (basically we are adding ref entries when committing tries). This scheme can work when only committing every Nth trie too. In that case we can use the commit block number as `age` in the ref entries. If a node is changed and then changed back between two commits, no ref entry is required but adding it will cause no harm either.

If the chain is forked, we leave all non-canonical entries where they are, the GC will eventually remove them. Generally speaking, unnecessary extra ref entries will never cause a problem.

### Basic operations

- read: no change, does not need to care about ref entries
- commit: write the new node/code if it is not in the db yet, then add a ref entry with the position and commit block number (even if the data was already there). Data and ref entry are added in the same batch.

### Garbage collection

Let's call the oldest block whose state we'd like to keep the `gc_block`. It has to be a block where we have actually committed the state.

We are constantly scanning the state with an iterator so that for each node or code entry we go through all existing references. For each reference (`hash`, `position`, `age`) reference:
- if `age` >= `gc_block.number` then ignore
- otherwise check the next db entry. If it is a (`hash`, `position`, `age2`) reference and `age2` <= `gc_block.number` then remove (`hash`, `position`, `age`) from the database.
- otherwise try reading `gc_block.state[position]`. If the given trie node or contract code (identified by `hash`) is not there any more then also remove (`hash`, `position`, `age`) reference.

If no references remain for a certain node/code entry, we remove the data too. Note that removing data could cause a data race in case a new reference is just added somewhere else so we have to come up with a low overhead and more or less elegant solution to this (probably very rare) corner case. The rest of the GC process is not affected by new trie commits because it only cares about ref entries that are not newer than `gc_block`.
