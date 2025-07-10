
export interface Trade {
  ticket: string;
  openTimeRaw: string;
  type: 'buy' | 'sell';
  size: number;
  item: string;
  openPrice: number;
  closeTimeRaw: string;
  closePrice: number;
  profit: number;
}

export interface GroupedTrades {
  [item: string]: {
    winners: Trade[];
    breakeven: Trade[];
    losers: Trade[];
  };
}

export interface PineScriptTimestamp {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
}
