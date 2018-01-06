ChainFilter (TrueBit+HashInput)
ObserverChain
TrueBit
HashInput (TrueBit)
MeteringVM (TrueBit)
ChainLogger (ObserverChain)
OnChainValidator (ChainFilter)
TrustlessSyncing (OnChainValidator)
PaymentSystem (PriorityManagement)
PriorityManagement (...ChainLogger)
FilterNetwork (ChainFilter+MeteringVM+ObserverChain+PaymentSystem)

