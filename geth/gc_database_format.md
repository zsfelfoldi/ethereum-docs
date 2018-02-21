#### Nibble-to-byte encoding

```
Even nibble count: nibbleEnc(nibbles) = {nibbles(0)*16+nibbles(1), ..., nibbles(2*i)*16+nibbles(2*i+1), 1}
Odd nibble count: nibbleEnc(nibbles) = {nibbles(0)*16+nibbles(1), ..., nibbles(2*i)*16, 0}
```

Note: this encoding keeps the lexicographical ordering of trie position, ensuring linear database access when iterating the trie.

#### State position encoding

```
State trie node: nibbleEnc(key_prefix)
Contract code: nibbleEnc(contract_key) + byte(0)
Contract storage trie node: nibbleEnc(contract_key) + nibbleEnc(storage_key_prefix) + byte(len(nibbleEnc(storage_key_prefix)))
```

#### Database key encoding

```
node_position + node_hash + byte(0) -> node_data
node_position + node_hash + uint64_bigEndian(block_number) + byte(1) -> NULL
```

