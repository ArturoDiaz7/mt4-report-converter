import React, { useState, useCallback } from 'react';
import { Trade } from '../types';
import { generatePineScriptForItem } from '../services/tradeProcessor';
import { ChevronDownIcon, ClipboardIcon, CheckIcon } from './icons';

interface TradeListProps {
  title: string;
  trades: Trade[];
  colorClass: string;
}

const TradeList: React.FC<TradeListProps> = ({ title, trades, colorClass }) => {
  if (trades.length === 0) return null;

  return (
    <div>
      <h4 className={`text-lg font-semibold mt-4 mb-2 ${colorClass}`}>{title} ({trades.length})</h4>
      <div className="space-y-2 text-sm">
        {trades.map((trade) => (
          <div key={trade.ticket} className="p-2 bg-gray-800 rounded-md grid grid-cols-3 md:grid-cols-5 gap-2">
            <span className="truncate">T: {trade.ticket}</span>
            <span className="truncate">O: {trade.openTimeRaw}</span>
            <span className="truncate">P: {trade.openPrice}</span>
            <span className="truncate">{trade.closeTimeRaw ? `C: ${trade.closeTimeRaw}` : ''}</span>
            <span className={`${trade.profit > 0 ? 'text-green-400' : 'text-red-400'}`}>
              Profit: {trade.profit.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

interface CollapsibleSectionProps {
  item: string;
  trades: {
    winners: Trade[];
    breakeven: Trade[];
    losers: Trade[];
  };
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ item, trades }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const totalTrades = trades.winners.length + trades.breakeven.length + trades.losers.length;

  const copyPineScript = useCallback(() => {
    const script = generatePineScriptForItem(item, trades);
    navigator.clipboard.writeText(script).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  }, [item, trades]);

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden">
      <div
        className="flex justify-between items-center p-4 cursor-pointer hover:bg-gray-700/50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center space-x-4">
          <span className="font-mono text-lg uppercase bg-blue-500/10 text-blue-300 px-3 py-1 rounded">
            {item}
          </span>
          <span className="text-gray-400">{totalTrades} Trades</span>
        </div>
        <ChevronDownIcon className={`w-6 h-6 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </div>
      {isOpen && (
        <div className="p-4 border-t border-gray-700">
          <TradeList title="Ganadores" trades={trades.winners} colorClass="text-green-400" />
          <TradeList title="Break Even" trades={trades.breakeven} colorClass="text-blue-400" />
          <TradeList title="Perdedores" trades={trades.losers} colorClass="text-red-400" />

          <div className="mt-6 flex justify-end">
            <button
              onClick={copyPineScript}
              className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 disabled:bg-indigo-400 disabled:cursor-not-allowed"
              disabled={isCopied}
            >
              {isCopied ? <CheckIcon /> : <ClipboardIcon />}
              <span>{isCopied ? 'Copiado!' : `Copiar Pine Script para ${item.toUpperCase()}`}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
