import { Trade, GroupedTrades, PineScriptTimestamp } from '../types';
import { MT4_UTC_OFFSET, TV_UTC_OFFSET, TV_TIMESTAMP_CORRECTION_HOURS } from '../constants';

/**
 * Parses a raw date string from the MT4 report (YYYY.MM.DD HH:mm:ss) into a true UTC Date object.
 * @param dateStr The date string from the report.
 * @returns A Date object representing the precise moment in UTC.
 */
function parseMT4DateToUTC(dateStr: string): Date {
  const parts = dateStr.match(/(\d{4})\.(\d{2})\.(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!parts) return new Date();

  const [, year, month, day, hours, minutes, seconds] = parts.map(Number);
  // Create a date assuming it's UTC, then adjust for the MT4 server's actual offset.
  const pseudoUTCDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
  pseudoUTCDate.setUTCHours(pseudoUTCDate.getUTCHours() - MT4_UTC_OFFSET);
  
  return pseudoUTCDate;
}

/**
 * Converts a true UTC Date object into a format suitable for Pine Script's timestamp() function,
 * applying the necessary offsets for TradingView chart synchronization.
 * @param utcDate The true UTC Date object for the trade event.
 * @returns An object with year, month, day, hours, and minutes for Pine Script.
 */
function convertToPineScriptTimestamp(utcDate: Date): PineScriptTimestamp {
  const adjustedDate = new Date(utcDate.getTime());
  // Adjust for the target TradingView chart's timezone and the correction factor.
  const hourAdjustment = TV_UTC_OFFSET + TV_TIMESTAMP_CORRECTION_HOURS;
  adjustedDate.setUTCHours(adjustedDate.getUTCHours() + hourAdjustment);

  return {
    year: adjustedDate.getUTCFullYear(),
    month: adjustedDate.getUTCMonth() + 1, // JS months are 0-11, Pine Script needs 1-12
    day: adjustedDate.getUTCDate(),
    hours: adjustedDate.getUTCHours(),
    minutes: adjustedDate.getUTCMinutes(),
  };
}

/**
 * Parses the HTML content of an MT4 report to extract closed trade data.
 * @param htmlContent The string content of the uploaded .html file.
 * @returns An array of Trade objects.
 */
export function parseMT4Report(htmlContent: string): Trade[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  const allRows = Array.from(doc.querySelectorAll('tr'));
  
  let inClosedTransactions = false;
  const trades: Trade[] = [];

  for (const row of allRows) {
    const cells = row.querySelectorAll('td');
    if (cells.length > 0 && cells[0].textContent?.includes('Closed Transactions:')) {
      inClosedTransactions = true;
      continue;
    }
    if (cells.length > 0 && (cells[0].textContent?.includes('Open Trades:') || cells[0].textContent?.includes('Working Orders:'))) {
      inClosedTransactions = false;
      break;
    }

    if (inClosedTransactions && cells.length === 14) {
      try {
        const type = cells[2].textContent?.trim().toLowerCase();
        if (type !== 'buy' && type !== 'sell') continue;
        
        const trade: Trade = {
          ticket: cells[0].textContent?.trim() || '',
          openTimeRaw: cells[1].textContent?.trim() || '',
          type: type as 'buy' | 'sell',
          size: parseFloat(cells[3].textContent?.trim() || '0'),
          item: cells[4].textContent?.trim().toLowerCase() || '',
          openPrice: parseFloat(cells[5].textContent?.trim() || '0'),
          closeTimeRaw: cells[8].textContent?.trim() || '',
          closePrice: parseFloat(cells[9].textContent?.trim() || '0'),
          profit: parseFloat(cells[13].textContent?.trim() || '0'),
        };
        // Only add trades with valid items
        if(trade.item) {
          trades.push(trade);
        }
      } catch(e) {
          console.error("Skipping a row due to parsing error:", e);
      }
    }
  }
  return trades;
}

/**
 * Classifies trades into winners, breakeven, and losers, groups them by item, and deduplicates winners.
 * @param allTrades The raw list of trades from the report.
 * @param beTolerance The profit/loss threshold to be considered "break even".
 * @returns A GroupedTrades object.
 */
export function classifyAndGroupTrades(allTrades: Trade[], beTolerance: number): GroupedTrades {
  const grouped: GroupedTrades = {};

  // Sort all trades by open time initially
  const sortedTrades = allTrades.sort((a, b) =>
    parseMT4DateToUTC(a.openTimeRaw).getTime() - parseMT4DateToUTC(b.openTimeRaw).getTime()
  );

  for (const trade of sortedTrades) {
    if (!grouped[trade.item]) {
      grouped[trade.item] = { winners: [], breakeven: [], losers: [] };
    }
    if (trade.profit > beTolerance) {
      grouped[trade.item].winners.push(trade);
    } else if (trade.profit >= -beTolerance && trade.profit <= beTolerance) {
      grouped[trade.item].breakeven.push(trade);
    } else { // profit < -beTolerance
      grouped[trade.item].losers.push(trade);
    }
  }

  // Deduplicate winners: if multiple trades have the same open time and price, keep the most profitable one.
  for (const item in grouped) {
    const winners = grouped[item].winners;
    const uniqueWinnersMap = new Map<string, Trade>();

    for (const winner of winners) {
      const key = `${winner.openTimeRaw}_${winner.openPrice}`;
      const existing = uniqueWinnersMap.get(key);
      if (!existing || winner.profit > existing.profit) {
        uniqueWinnersMap.set(key, winner);
      }
    }
    grouped[item].winners = Array.from(uniqueWinnersMap.values()).sort((a, b) => 
        parseMT4DateToUTC(a.openTimeRaw).getTime() - parseMT4DateToUTC(b.openTimeRaw).getTime()
    );
  }

  return grouped;
}

/**
 * Generates the full Pine Script v5 code for a given trading instrument and its trades.
 * @param item The trading instrument (e.g., 'eurusd').
 * @param data The trades for the instrument, categorized.
 * @returns A string containing the complete Pine Script code.
 */
export function generatePineScriptForItem(
  item: string,
  data: { winners: Trade[]; breakeven: Trade[]; losers: Trade[] }
): string {
    const header = `//@version=5
indicator("${item.toUpperCase()} Trades from Report", overlay=true, scale=scale.price)

// --- INPUTS ---
var string size_tiny = "tiny"
var string size_small = "small"
var string size_normal = "normal"
var string size_large = "large"
var string size_huge = "huge"
var iconSize = input.string(size_normal, "Icon Size", options=[size_tiny, size_small, size_normal, size_large, size_huge])

if barstate.islast
`;

    let winnersCode = '', breakevenCode = '', losersCode = '';

    // --- WINNERS ---
    for (const trade of data.winners) {
        const openTimestamp = convertToPineScriptTimestamp(parseMT4DateToUTC(trade.openTimeRaw));
        const closeTimestamp = convertToPineScriptTimestamp(parseMT4DateToUTC(trade.closeTimeRaw));
        const tooltip = `Ticket: ${trade.ticket}\\nType: ${trade.type}\\nProfit: ${trade.profit.toFixed(2)}`;
        
        winnersCode += `    // Winner: ${trade.ticket}
    label.new(timestamp(${openTimestamp.year}, ${openTimestamp.month}, ${openTimestamp.day}, ${openTimestamp.hours}, ${openTimestamp.minutes}), ${trade.openPrice}, style=label.style_diamond, color=color.new(color.green, 20), textcolor=color.green, size=iconSize, tooltip="${tooltip}", xloc=xloc.bar_time, yloc=yloc.price)
    label.new(timestamp(${closeTimestamp.year}, ${closeTimestamp.month}, ${closeTimestamp.day}, ${closeTimestamp.hours}, ${closeTimestamp.minutes}), ${trade.closePrice}, style=label.style_diamond, color=color.new(color.green, 20), textcolor=color.green, size=iconSize, tooltip="${tooltip}", xloc=xloc.bar_time, yloc=yloc.price)
    line.new(timestamp(${openTimestamp.year}, ${openTimestamp.month}, ${openTimestamp.day}, ${openTimestamp.hours}, ${openTimestamp.minutes}), ${trade.openPrice}, timestamp(${closeTimestamp.year}, ${closeTimestamp.month}, ${closeTimestamp.day}, ${closeTimestamp.hours}, ${closeTimestamp.minutes}), ${trade.closePrice}, color=color.new(color.white, 50), style=line.style_dotted, width=1, xloc=xloc.bar_time, yloc=yloc.price)
`;
    }

    // --- BREAKEVEN ---
    for (const trade of data.breakeven) {
        const openTimestamp = convertToPineScriptTimestamp(parseMT4DateToUTC(trade.openTimeRaw));
        const tooltip = `Ticket: ${trade.ticket}\\nType: ${trade.type}\\nProfit: ${trade.profit.toFixed(2)}`;

        breakevenCode += `    // Break Even: ${trade.ticket}
    label.new(timestamp(${openTimestamp.year}, ${openTimestamp.month}, ${openTimestamp.day}, ${openTimestamp.hours}, ${openTimestamp.minutes}), ${trade.openPrice}, style=label.style_circle, color=color.new(color.blue, 20), textcolor=color.blue, size=iconSize, tooltip="${tooltip}", xloc=xloc.bar_time, yloc=yloc.price)
`;
    }

    // --- LOSERS ---
    for (const trade of data.losers) {
        const openTimestamp = convertToPineScriptTimestamp(parseMT4DateToUTC(trade.openTimeRaw));
        const style = trade.type === 'buy' ? 'label.style_arrowup' : 'label.style_arrowdown';
        const tooltip = `Ticket: ${trade.ticket}\\nType: ${trade.type}\\nProfit: ${trade.profit.toFixed(2)}`;

        losersCode += `    // Loser: ${trade.ticket}
    label.new(timestamp(${openTimestamp.year}, ${openTimestamp.month}, ${openTimestamp.day}, ${openTimestamp.hours}, ${openTimestamp.minutes}), ${trade.openPrice}, style=${style}, color=color.new(color.red, 20), textcolor=color.red, size=iconSize, tooltip="${tooltip}", xloc=xloc.bar_time, yloc=yloc.price)
`;
    }
    
    return header + winnersCode + breakevenCode + losersCode;
}
