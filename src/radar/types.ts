export type RadarStage='discovered'|'profiled'|'tracking'|'scored'|'error';
export type RadarEventKind='buy'|'sell'|'phase'|'transfer';
export type ScoreConfidence='provisional'|'low'|'medium'|'high';
export type WatchKind='token'|'wallet';

export interface RadarCursor {
 name:string;
 blockNumber:string;
 blockHash:string|null;
 updatedAt:number;
}

export interface RadarProfile {
 name:string;
 symbol:string;
 decimals:number;
 phase:number;
 creatorTaxBps:number;
 creatorFeeRecipient:string;
 totalSupply:string;
 deployerBalance:string;
 holderCount:number|null;
 metadataComplete:boolean;
 profiledAtBlock:string;
 profiledAt:number;
}

export interface RadarLaunch {
 token:string;
 curve:string;
 deployer:string;
 pairToken:string;
 launchBlock:string;
 blockHash:string;
 txHash:string;
 logIndex:number;
 state:RadarStage;
 profile:RadarProfile|null;
 profileError:string|null;
 updatedAt:number;
}

export interface RadarEvent {
 id:string;
 token:string;
 curve:string;
 wallet:string|null;
 kind:RadarEventKind;
 tokens:string|null;
 quote:string|null;
 blockNumber:string;
 blockHash:string;
 txHash:string;
 logIndex:number;
 at:number|null;
 complete:boolean;
}

export interface WalletTokenPosition {
 wallet:string;
 token:string;
 pairToken:string;
 tokenBalance:string;
 remainingCost:string;
 realizedPnl:string;
 observedProceeds:string;
 buys:number;
 sells:number;
 firstBuyBlock:string|null;
 lastTradeBlock:string|null;
 complete:boolean;
 updatedAt:number;
 currentValue?:string|null;
 openPnl?:string|null;
 totalPnl?:string|null;
 returnBps?:number|null;
 markedAtBlock?:string|null;
}

export interface WalletOutcome {
 wallet:string;
 token:string;
 closedAt:number;
 cost:string;
 proceeds:string;
 pnl:string;
 returnBps:number|null;
 complete:boolean;
}

export interface ScoreComponent {
 key:string;
 weight:number;
 value:number|null;
 evidence:string;
 known:boolean;
}

export interface ScoreSnapshot {
 subject:string;
 kind:'launch-quality'|'wallet-reputation'|'radar-strength';
 value:number|null;
 confidence:ScoreConfidence;
 modelVersion:string;
 asOfBlock:string;
 computedAt:number;
 components:ScoreComponent[];
 unknownInputs:string[];
 explanation:string;
}

export interface RadarActivity {
 id:string;
 subject:string;
 subjectKind:WatchKind;
 kind:string;
 material:boolean;
 blockNumber:string;
 blockHash:string|null;
 txHash:string|null;
 createdAt:number;
 summary:string;
}

export interface WatchlistItem {
 kind:WatchKind;
 address:string;
 createdAt:number;
}

export interface Page<T> {
 items:T[];
 nextCursor:string|null;
}
