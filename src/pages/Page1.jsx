/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from "react-router-dom";
import { createChart, ColorType, CandlestickSeries, LineSeries, createSeriesMarkers } from 'lightweight-charts';
import { Activity, Play, Pause, SkipBack, SkipForward, LayoutGrid, MousePointer2, Layers, X, Maximize2, Plus, Minus, Crown, ChevronDown, Lock, Pencil, TrendingUp, Square, Trash2 } from 'lucide-react';
import { DrawingEngine } from '../engine/DrawingEngine';


// HELPER: INDICATORS Technical Analysis 
const calculateSMA = (data, period) => {
  const sma = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { sma.push({ time: data[i].time, value: null }); continue; }
    const sum = data.slice(i - period + 1, i + 1).reduce((acc, val) => acc + val.close, 0);
    sma.push({ time: data[i].time, value: sum / period });
  }
  return sma.filter(v => v.value !== null);
};

const calculateBB = (data, period, stdDev) => {
  const upper = []; const lower = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) continue;
    const slice = data.slice(i - period + 1, i + 1);
    const mean = slice.reduce((acc, val) => acc + val.close, 0) / period;
    const variance = slice.reduce((acc, val) => acc + Math.pow(val.close - mean, 2), 0) / period;
    const sd = Math.sqrt(variance);
    upper.push({ time: data[i].time, value: mean + (stdDev * sd) });
    lower.push({ time: data[i].time, value: mean - (stdDev * sd) });
  }
  return { upper, lower };
};

// INTELLIGENT DATE PARSER
const parseDate = (raw) => {
  if (raw === undefined || raw === null) return null;

  let ts;

  if (typeof raw === 'number') {
    if (raw > 1000000) {
      ts = raw > 100000000000 ? Math.floor(raw / 1000) : Math.floor(raw);
    } else {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const ms = excelEpoch.getTime() + raw * 86400 * 1000;
      ts = Math.floor(ms / 1000);
    }
  } else {
    const str = String(raw).trim();

    const nseMatch = str.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
    if (nseMatch) {
      const months = {
        JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
        JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11
      };
      const d = new Date(Date.UTC(
        +nseMatch[3],
        months[nseMatch[2].toUpperCase()],
        +nseMatch[1]
      ));
      ts = Math.floor(d.getTime() / 1000);
    } else {
      const parsed = Date.parse(str);
      if (!isNaN(parsed)) ts = Math.floor(parsed / 1000);
    }
  }

  if (!ts) return null;

  // 🔥 FORCE IST
  return ts + 5.5 * 60 * 60;
};


// --- NEW: IN-MEMORY SESSION CACHE ---
// Survives React Router navigation but resets on F5/Refresh
const sessionCache = {
  fullData: [],
  currentIndex: 0,
  activePositions: [],
  closedHistory: [],
  equityHistory: [],
  isLoaded: false,
  qtyInput: 1.0,
  c1Timeframe: 5,
  c2Timeframe: 15,
  c1Ma: { visible: false, period: 20 },
  c1Bb: { visible: false, period: 20, std: 2 },
  c2Ma: { visible: false, period: 50 },
  // Added: Cache for Advanced UI
  isExpanded: false,
  isMarket: true,
  isTrigger: false,
  limitPrice: "",
  triggerPrice: "",
  pendingOrders: [],
  executions: [],
};

const Page1 = () => {
  const navigate = useNavigate();

  // UI STATE (DIALOGS)
  const [showTradeDialog, setShowTradeDialog] = useState(false);
  const [showToolsDialog, setShowToolsDialog] = useState(false);
  const [activeTab, setActiveTab] = useState('trade');
  const [chartsReady, setChartsReady] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);

  // CORE STATE (Initialized from cache)
  const [fullData, setFullData] = useState(sessionCache.fullData);
  const [currentIndex, setCurrentIndex] = useState(sessionCache.currentIndex);
  const [isLoaded, setIsLoaded] = useState(sessionCache.isLoaded);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(100);

  // TRADING STATE (Initialized from cache)
  const [balance] = useState(100000);
  const [qtyInput, setQtyInput] = useState(sessionCache.qtyInput);
  const [activePositions, setActivePositions] = useState(sessionCache.activePositions);
  const [closedHistory, setClosedHistory] = useState(sessionCache.closedHistory);
  const [equityHistory, setEquityHistory] = useState(sessionCache.equityHistory);
  const [pendingOrders, setPendingOrders] = useState(sessionCache.pendingOrders); // NEW
  const [executions, setExecutions] = useState(sessionCache.executions);

  // Advanced UI State (Initialized from cache)
  const [isExpanded, setIsExpanded] = useState(sessionCache.isExpanded);
  const [isMarket, setIsMarket] = useState(sessionCache.isMarket);
  const [isTrigger, setIsTrigger] = useState(sessionCache.isTrigger);
  const [limitPrice, setLimitPrice] = useState(sessionCache.limitPrice);   // NEW
  const [triggerPrice, setTriggerPrice] = useState(sessionCache.triggerPrice); // NEW

  // TIMEFRAMES (Initialized from cache)
  const [c1Timeframe, setC1Timeframe] = useState(sessionCache.c1Timeframe);
  const [c2Timeframe, setC2Timeframe] = useState(sessionCache.c2Timeframe);

  // FLOATING ORDER PANEL and DRAW PANEL 
  const [activePanel, setActivePanel] = useState(null); // 'ORDER' | 'DRAW' | null
  const [orderPos, setOrderPos] = useState({ x: 20, y: 60 });
  const [drawPos, setDrawPos] = useState({ x: 20, y: 60 });

  // INDICATOR & Marker STATE (Initialized from cache)
  const [c1Ma, setC1Ma] = useState(sessionCache.c1Ma);
  const [c1Bb, setC1Bb] = useState(sessionCache.c1Bb);
  const [c2Ma, setC2Ma] = useState(sessionCache.c2Ma);
  const [showMarkers, setShowMarkers] = useState(sessionCache.showMarkers ?? false);

  // Label logic based on your exact conditions
  let orderModeLabel = 'Intraday - Limit'; // Both unselected
  if (isMarket && !isTrigger) orderModeLabel = 'Intraday - Market';
  if (!isMarket && isTrigger) orderModeLabel = 'Intraday - SL - L';
  if (isMarket && isTrigger) orderModeLabel = 'Intraday - SL - M';


  // NEW: KEEP CACHE SYNCED WITH STATE
  // (Must be placed AFTER all the state declarations above)
  useEffect(() => {
    sessionCache.fullData = fullData;
    sessionCache.currentIndex = currentIndex;
    sessionCache.activePositions = activePositions;
    sessionCache.closedHistory = closedHistory;
    sessionCache.equityHistory = equityHistory;
    sessionCache.isLoaded = isLoaded;
    sessionCache.qtyInput = qtyInput;
    sessionCache.c1Timeframe = c1Timeframe;
    sessionCache.c2Timeframe = c2Timeframe;
    sessionCache.c1Ma = c1Ma;
    sessionCache.c1Bb = c1Bb;
    sessionCache.c2Ma = c2Ma;
    // NEW
    sessionCache.isExpanded = isExpanded;
    sessionCache.isMarket = isMarket;
    sessionCache.isTrigger = isTrigger;
    sessionCache.limitPrice = limitPrice;
    sessionCache.triggerPrice = triggerPrice;
    sessionCache.pendingOrders = pendingOrders; // NEW
    sessionCache.executions = executions;
    sessionCache.showMarkers = showMarkers;

  }, [fullData, currentIndex, activePositions, closedHistory, equityHistory, isLoaded, qtyInput, c1Timeframe, c2Timeframe, c1Ma, c1Bb, c2Ma, isExpanded, isMarket, isTrigger, limitPrice, triggerPrice, pendingOrders, executions, showMarkers]);

  // REFS
  const container1 = useRef();
  const container2 = useRef();
  const chartRefs = useRef({});
  const seriesRefs = useRef({});
  const priceLineRefs = useRef({});
  const markersRefs = useRef({ c1: null, c2: null });
  const prevTimeframes = useRef({ c1: null, c2: null });

  // COMPUTED VALUES
  const currentBar = fullData[currentIndex] || {};
  const currentPrice = currentBar.close || 0;
  const currentTime = currentBar.time || 0;

  // COMPUTED VALUES // NOTE: All chart timestamps are IST-shifted (+5:30)
  const formatTime = (t) => {
    if (!t) return "--";
    return new Date(t * 1000).toLocaleString('en-IN', {
      hour12: false,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  const IST_OFFSET = 5.5 * 60 * 60; // seconds

  const openPnL = activePositions.reduce((acc, pos) => {
    const diff = currentPrice - pos.price;
    return acc + (pos.type === 'BUY' ? diff * pos.qty : -diff * pos.qty);
  }, 0);

  // ORDER MANAGEMENT AND STATISTIC
  // ACTIONS 
  // --- CORE TRADING ENGINE (NETTING & FILLS) ---
  const executeTrade = (tradeType, tradeQty, fillPrice, sourceOrderMode) => {
    // NEW: Record the exact time and detail for the LWC Marker
    setExecutions(prev => [...prev, { time: currentTime, type: tradeType, qty: tradeQty }]);

    setActivePositions(prevPositions => {
      let currentPos = prevPositions.length > 0 ? prevPositions[0] : null;

      // 1. NO OPEN POSITION: Just open a new one
      if (!currentPos) {
        return [{ id: Date.now(), type: tradeType, price: fillPrice, qty: tradeQty, time: formatTime(currentTime) }];
      }

      // 2. ADDING TO SAME DIRECTION: Average the price
      if (currentPos.type === tradeType) {
        const totalQty = currentPos.qty + tradeQty;
        const avgPrice = ((currentPos.qty * currentPos.price) + (tradeQty * fillPrice)) / totalQty;
        return [{ ...currentPos, price: avgPrice, qty: totalQty }];
      }

      // 3. OPPOSITE DIRECTION: Reduce, Close, or Reverse
      else {
        let realizedPnL = 0;
        let remainingQty = currentPos.qty - tradeQty;

        if (tradeQty < currentPos.qty) {
          // Partial Close
          realizedPnL = (fillPrice - currentPos.price) * tradeQty * (currentPos.type === 'BUY' ? 1 : -1);
          setClosedHistory(prev => [{ ...currentPos, exitPrice: fillPrice, profit: realizedPnL, exitTime: formatTime(currentTime), qty: tradeQty, remark: sourceOrderMode }, ...prev]);
          return [{ ...currentPos, qty: remainingQty }];
        }
        else if (tradeQty === currentPos.qty) {
          // Full Close
          realizedPnL = (fillPrice - currentPos.price) * currentPos.qty * (currentPos.type === 'BUY' ? 1 : -1);
          setClosedHistory(prev => [{ ...currentPos, exitPrice: fillPrice, profit: realizedPnL, exitTime: formatTime(currentTime), remark: sourceOrderMode }, ...prev]);
          return []; // Position fully closed
        }
        else {
          // Reverse Position (e.g. Long 1, Sell 2 -> Short 1)
          realizedPnL = (fillPrice - currentPos.price) * currentPos.qty * (currentPos.type === 'BUY' ? 1 : -1);
          setClosedHistory(prev => [{ ...currentPos, exitPrice: fillPrice, profit: realizedPnL, exitTime: formatTime(currentTime), remark: sourceOrderMode }, ...prev]);
          const newTradeQty = tradeQty - currentPos.qty;
          return [{ id: Date.now(), type: tradeType, price: fillPrice, qty: newTradeQty, time: formatTime(currentTime) }];
        }
      }
    });
  };

  const executeOrder = (type) => {
    if (!isLoaded) return;

    const timeStr = formatTime(currentTime);

    // MARKET ORDER: Execute immediately
    if (isMarket && !isTrigger) {
      executeTrade(type, qtyInput, currentPrice, "Market");
      return;
    }

    const lmtPx = Number(limitPrice);
    const trgPx = Number(triggerPrice);

    // LIMIT ORDER IMMEDIATE FILL LOGIC: 
    // If you place a Buy Limit above current price, or Sell Limit below current price, it executes instantly.
    if (!isMarket && !isTrigger) {
      if ((type === 'BUY' && currentPrice <= lmtPx) || (type === 'SELL' && currentPrice >= lmtPx)) {
        executeTrade(type, qtyInput, currentPrice, "Limit (Instant Better Px)");
        return;
      }
    }

    // Otherwise, it rests in the order book as a PENDING order
    const newPendingOrder = {
      id: Date.now(),
      type,
      qty: qtyInput,
      time: timeStr,
      mode: orderModeLabel,
      limitPx: !isMarket ? lmtPx : null,
      triggerPx: isTrigger ? trgPx : null,
      status: 'PENDING'
    };

    setPendingOrders([...pendingOrders, newPendingOrder]);

    // Clear UI inputs after placing order
    if (!isMarket) setLimitPrice("");
    if (isTrigger) setTriggerPrice("");
  };

  const cancelOrder = (id) => {
    setPendingOrders(pendingOrders.filter(o => o.id !== id));
  };

  const closePosition = (id) => {
    const pos = activePositions.find(p => p.id === id);
    if (pos) executeTrade(pos.type === 'BUY' ? 'SELL' : 'BUY', pos.qty, currentPrice, "Manual Close");
  };

  const closeAllPositions = () => {
    if (activePositions.length > 0) {
      const pos = activePositions[0];
      executeTrade(pos.type === 'BUY' ? 'SELL' : 'BUY', pos.qty, currentPrice, "Close All");
    }
    // Also cancel all pending orders on Close All
    setPendingOrders([]);
  };

  // NEW: PENDING ORDER EXECUTION ENGINE
  // This watches the price every time it moves and fills orders if conditions are met
  // PENDING ORDER EXECUTION ENGINE
  useEffect(() => {
    if (!isLoaded || pendingOrders.length === 0) return;

    let executedOrderIds = [];

    pendingOrders.forEach((order) => {
      let shouldExecute = false;
      let fillPrice = currentPrice;

      if (order.mode === 'Intraday - Limit') {
        if (order.type === 'BUY' && currentPrice <= order.limitPx) { shouldExecute = true; fillPrice = order.limitPx; }
        else if (order.type === 'SELL' && currentPrice >= order.limitPx) { shouldExecute = true; fillPrice = order.limitPx; }
      }
      else if (order.mode === 'Intraday - SL - M') {
        if (order.type === 'BUY' && currentPrice >= order.triggerPx) { shouldExecute = true; fillPrice = currentPrice; }
        else if (order.type === 'SELL' && currentPrice <= order.triggerPx) { shouldExecute = true; fillPrice = currentPrice; }
      }
      else if (order.mode === 'Intraday - SL - L') {
        if (order.status === 'PENDING') {
          if ((order.type === 'BUY' && currentPrice >= order.triggerPx) || (order.type === 'SELL' && currentPrice <= order.triggerPx)) {
            order.status = 'TRIGGERED';
          }
        }
        if (order.status === 'TRIGGERED') {
          if (order.type === 'BUY' && currentPrice <= order.limitPx) { shouldExecute = true; fillPrice = order.limitPx; }
          else if (order.type === 'SELL' && currentPrice >= order.limitPx) { shouldExecute = true; fillPrice = order.limitPx; }
        }
      }

      if (shouldExecute) {
        executeTrade(order.type, order.qty, fillPrice, order.mode);
        executedOrderIds.push(order.id);
      }
    });

    if (executedOrderIds.length > 0) {
      setPendingOrders(prev => prev.filter(o => !executedOrderIds.includes(o.id)));
    }
  }, [currentIndex, currentPrice, isLoaded]); // Runs on every price tick


  // HELPER: Simple SVG Equity Curve Generator
  const generateEquityPath = () => {
    if (equityHistory.length < 2) return { area: "", line: "" };

    const data = equityHistory;
    const minVal = Math.min(...data.map(d => d.value));
    const maxVal = Math.max(...data.map(d => d.value));
    const range = maxVal - minVal || 1; // Avoid divide by zero

    // Create points normalized to 0-100 range
    const points = data.map((d, i) => {
      const x = (i / (data.length - 1)) * 100;
      // Invert Y because SVG 0 is at the top
      const y = 100 - ((d.value - minVal) / range) * 100;
      return `${x},${y}`;
    }).join(" ");

    // Line is just the points
    const line = `M ${points}`;
    // Area closes the loop to the bottom corners
    const area = `${line} L 100,100 L 0,100 Z`;

    return { area, line };
  };

  const { area: areaPath, line: linePath } = generateEquityPath();

  // PERFORMANCE CALCS
  const totalTrades = closedHistory.length;
  const winningTrades = closedHistory.filter(t => t.profit > 0);
  const losingTrades = closedHistory.filter(t => t.profit <= 0);
  const winRate = totalTrades > 0 ? ((winningTrades.length / totalTrades) * 100).toFixed(2) : 0;
  const grossProfit = winningTrades.reduce((a, b) => a + b.profit, 0);
  const grossLoss = Math.abs(losingTrades.reduce((a, b) => a + b.profit, 0));
  const netProfit = grossProfit - grossLoss;

  let maxEquity = balance;
  let maxDrawdown = 0;
  equityHistory.forEach(eq => {
    if (eq.value > maxEquity) maxEquity = eq.value;
    const drawdown = maxEquity - eq.value;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  });

  // CHARTS MANAGEMENT
  // ON LOAD: FETCH AND PARSE DEFAULT JSON
  useEffect(() => {
    // If the data is already loaded in memory (navigating back from page 2), abort the fetch.
    if (sessionCache.isLoaded) return;

    const loadData = async () => {
      const FILE_NAME = '/ohlc-template-v1.json';
      const CACHE_KEY = `cached_ohlc_${FILE_NAME}`;
      try {
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('cached_ohlc_') && key !== CACHE_KEY) {
            localStorage.removeItem(key);
          }
        });

        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          processData(JSON.parse(cached));
          return;
        }

        const res = await fetch(FILE_NAME);
        if (!res.ok) throw new Error("Could not fetch JSON");
        const json = await res.json();
        localStorage.setItem(CACHE_KEY, JSON.stringify(json));
        processData(json);
      } catch (err) {
        console.error("Auto-load error: ", err);
      }
    };

    const processData = (json) => {
      const cleanData = json.map(row => {
        const isArray = Array.isArray(row);
        return {
          time: parseDate(isArray ? row[0] : (row.Date || row.date || row.time)),
          open: isArray ? +row[1] : (+row.Open || +row.open),
          high: isArray ? +row[2] : (+row.High || +row.high),
          low: isArray ? +row[3] : (+row.Low || +row.low),
          close: isArray ? +row[4] : (+row.Close || +row.close)
        };
      })
        .filter(d => d.time && !isNaN(d.close))
        .sort((a, b) => a.time - b.time)
        .filter((v, i, a) => i === 0 || v.time !== a[i - 1].time);

      if (cleanData.length > 0) {
        setFullData(cleanData);
        const maxStartIdx = Math.max(1, cleanData.length - 100);
        const randomIdx = Math.floor(Math.random() * maxStartIdx) + 50;
        setCurrentIndex(Math.min(randomIdx, cleanData.length - 1));
        setEquityHistory([{ time: cleanData[0].time, value: balance }]);
        setIsLoaded(true);
      }
    };

    loadData();
  }, []);

  // INITIALIZE CHARTS
  useEffect(() => {
    const baseConfig = {
      localization: {
        timeFormatter: (t) => {
          const d = new Date(t * 1000);
          return d.toLocaleString('en-IN', {
            timeZone: 'UTC', // 🔥 THIS IS THE KEY
            hour12: false,
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
        }
      },
      layout: { background: { type: ColorType.Solid, color: '#000000' }, textColor: '#d1d5db' },
      grid: { vertLines: { color: '#1f2937' }, horzLines: { color: '#1f2937' } },
      timeScale: {
        borderColor: '#374151',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: { mode: 0 },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true }
    };

    const initChart = (ref, key) => {
      if (!ref.current) return;
      const chart = createChart(ref.current, { ...baseConfig, width: ref.current.clientWidth, height: ref.current.clientHeight });
      seriesRefs.current[`${key}C`] = chart.addSeries(CandlestickSeries, { upColor: '#00ff00', downColor: '#ffffff', wickUpColor: '#00ff00', wickDownColor: '#ffffff', borderVisible: false });
      seriesRefs.current[`${key}Ma`] = chart.addSeries(LineSeries, { color: '#ff0000', lineWidth: 1 });
      seriesRefs.current[`${key}BbU`] = chart.addSeries(LineSeries, { color: '#00bfff', lineWidth: 1, lineStyle: 2 });
      seriesRefs.current[`${key}BbL`] = chart.addSeries(LineSeries, { color: '#00bfff', lineWidth: 1, lineStyle: 2 });
      chartRefs.current[key] = chart;
    };

    initChart(container1, 'c1');
    initChart(container2, 'c2');

    setChartsReady(true);

    const resize = () => Object.values(chartRefs.current).forEach(c => {
      if (c?.chartElement()?.parentElement) {
        c.applyOptions({ width: c.chartElement().parentElement.clientWidth, height: c.chartElement().parentElement.clientHeight });
      }
    });

    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      Object.values(chartRefs.current).forEach(c => c.remove());
      engine1Ref.current.destroy();
      engine2Ref.current.destroy();
      priceLineRefs.current = {};
    };
  }, []);

  // UPDATE CHARTS & LOGIC
  useEffect(() => {
    if (!isLoaded || !chartsReady || !seriesRefs.current.c1C) return;
    const getAggregatedData = (data, multiplier, maxIndex) => {
      if (multiplier === 1) return data.slice(0, maxIndex + 1);
      const aggData = [];
      for (let i = 0; i <= maxIndex; i += multiplier) {
        const chunk = data.slice(i, Math.min(i + multiplier, maxIndex + 1));
        if (chunk.length) {
          aggData.push({ time: chunk[0].time, open: chunk[0].open, high: Math.max(...chunk.map((c) => c.high)), low: Math.min(...chunk.map((c) => c.low)), close: chunk[chunk.length - 1].close });
        }
      }
      return aggData;
    };

    const c1Data = getAggregatedData(fullData, c1Timeframe, currentIndex);
    const c2Data = getAggregatedData(fullData, c2Timeframe, currentIndex);

    seriesRefs.current.c1C.setData(c1Data);
    seriesRefs.current.c2C.setData(c2Data);

    const sma1 = calculateSMA(c1Data, c1Ma.period);
    seriesRefs.current.c1Ma.setData(sma1);
    seriesRefs.current.c1Ma.applyOptions({ visible: c1Ma.visible });

    const bb1 = calculateBB(c1Data, c1Bb.period, c1Bb.std);
    seriesRefs.current.c1BbU.setData(bb1.upper);
    seriesRefs.current.c1BbL.setData(bb1.lower);
    seriesRefs.current.c1BbU.applyOptions({ visible: c1Bb.visible });
    seriesRefs.current.c1BbL.applyOptions({ visible: c1Bb.visible });

    const sma2 = calculateSMA(c2Data, c2Ma.period);
    seriesRefs.current.c2Ma.setData(sma2);
    seriesRefs.current.c2Ma.applyOptions({ visible: c2Ma.visible });

    engine1Ref.current.remapTimes(c1Data);
    engine2Ref.current.remapTimes(c2Data);

    // Scroll to latest candle ONLY when timeframe changes.
    // Never on simulator ticks — user controls viewport freely otherwise.
    const tf1Changed = prevTimeframes.current.c1 !== c1Timeframe;
    const tf2Changed = prevTimeframes.current.c2 !== c2Timeframe;

    if (tf1Changed) {
      chartRefs.current.c1?.timeScale().fitContent();
      prevTimeframes.current.c1 = c1Timeframe;
    }
    if (tf2Changed) {
      chartRefs.current.c2?.timeScale().fitContent();
      prevTimeframes.current.c2 = c2Timeframe;
    }


    const currentLineIds = Object.keys(priceLineRefs.current);
    currentLineIds.forEach(id => {
      const refs = priceLineRefs.current[id];
      if (refs.c1 && seriesRefs.current.c1C) seriesRefs.current.c1C.removePriceLine(refs.c1);
      if (refs.c2 && seriesRefs.current.c2C) seriesRefs.current.c2C.removePriceLine(refs.c2);
      delete priceLineRefs.current[id];
    });

    // --- NEW: APPLY SERIES MARKERS (LWC v5 Plugin API) ---
    if (seriesRefs.current.c1C && executions.length > 0 && showMarkers) {
      // 1. Format markers for LWC
      const rawMarkers = executions
        .filter(ex => ex.time <= currentTime) // Only show up to current playback time
        .sort((a, b) => a.time - b.time)
        .map(ex => ({
          time: ex.time,
          position: ex.type === 'BUY' ? 'belowBar' : 'aboveBar',
          color: ex.type === 'BUY' ? '#22c55e' : '#ef4444',
          shape: ex.type === 'BUY' ? 'arrowUp' : 'arrowDown',
          text: `${ex.type === 'BUY' ? 'B' : 'S'} ${ex.qty}`,
          size: 1
        }));

      // 2. Base Chart (c1)
      if (seriesRefs.current.c1C) {
        const validC1Markers = rawMarkers.map(m => {
          // Snap to the exact aggregated candle time so it doesn't disappear on higher TFs
          const aggBar = c1Data.slice().reverse().find(d => d.time <= m.time);
          return aggBar ? { ...m, time: aggBar.time } : null;
        }).filter(Boolean);

        if (!markersRefs.current.c1) {
          markersRefs.current.c1 = createSeriesMarkers(seriesRefs.current.c1C, validC1Markers);
        } else {
          markersRefs.current.c1.setMarkers(validC1Markers);
        }
      }

      // 3. Aggregated Chart (c2)
      if (seriesRefs.current.c2C) {
        const validC2Markers = rawMarkers.map(m => {
          const aggBar = c2Data.slice().reverse().find(d => d.time <= m.time);
          return aggBar ? { ...m, time: aggBar.time } : null;
        }).filter(Boolean);

        if (!markersRefs.current.c2) {
          markersRefs.current.c2 = createSeriesMarkers(seriesRefs.current.c2C, validC2Markers);
        } else {
          markersRefs.current.c2.setMarkers(validC2Markers);
        }
      }
    } else {
      // If toggled off or no executions, clear the markers cleanly
      if (markersRefs.current.c1) markersRefs.current.c1.setMarkers([]);
      if (markersRefs.current.c2) markersRefs.current.c2.setMarkers([]);
    }
    // --- END NEW ---


    // Restore Equity Update
    const currentEquity = balance + closedHistory.reduce((a, b) => a + b.profit, 0) + openPnL;
    let newEqHistory = equityHistory.filter(item => item.time < currentTime);
    if (newEqHistory.length === 0 || newEqHistory[newEqHistory.length - 1].time !== currentTime) {
      newEqHistory.push({ time: currentTime, value: currentEquity });
    }
    setEquityHistory(newEqHistory)
  }, [currentIndex, isLoaded, c1Ma, c1Bb, c2Ma, openPnL, chartsReady, c1Timeframe, c2Timeframe, executions, showMarkers]);



  //DIALOG BOX MOUSE EVENTS
  //Dialog Box Drag Logic
  const orderRef = useRef(null);
  const drawRef = useRef(null);
  const dragInfo = useRef({ isDragging: false, startX: 0, startY: 0, panelType: null });

  // DRAG LOGIC WITH BOUNDARIES
  const handlePointerDown = (e, type) => {
    const currentPos = type === 'ORDER' ? orderPos : drawPos;
    dragInfo.current = {
      isDragging: true,
      startX: e.clientX - currentPos.x,
      startY: e.clientY - currentPos.y,
      panelType: type
    };
    e.target.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!dragInfo.current.isDragging) return;

    const { startX, startY, panelType } = dragInfo.current;
    let newX = e.clientX - startX;
    let newY = e.clientY - startY;

    // Boundary Constraint Logic
    const panelRef = panelType === 'ORDER' ? orderRef : drawRef;
    if (panelRef.current) {
      const rect = panelRef.current.getBoundingClientRect();
      const maxX = window.innerWidth - rect.width;
      const maxY = window.innerHeight - rect.height;

      // Ensure panel stays within 0 and Max X/Y
      newX = Math.max(0, Math.min(newX, maxX));
      newY = Math.max(0, Math.min(newY, maxY));
    }

    if (panelType === 'ORDER') setOrderPos({ x: newX, y: newY });
    if (panelType === 'DRAW') setDrawPos({ x: newX, y: newY });
  };

  const handlePointerUp = (e) => {
    dragInfo.current.isDragging = false;
    e.target.releasePointerCapture(e.pointerId);
  };

  const handleChartPointer = useCallback((e, chartIdx) => {
    if (e.button !== undefined && e.button !== 0 && e.type === 'pointerdown') return;
    const ref = chartIdx === 0 ? container1 : container2;
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const engine = chartIdx === 0 ? engine1Ref.current : engine2Ref.current;

    if (e.type === 'pointermove') {
      engine.handleMouseMove(x, y);
      return;
    }

    if (e.type === 'pointerdown') {
      const isTouch = e.pointerType === 'touch';

      if (isTouch && engine.activePrim) {
        // Mobile second tap: commit at the frozen preview position,
        // not at the tap coordinates (which are wherever the finger lands).
        engine.commitCurrentPreview();
      } else {
        engine.handleMouseDown(x, y);
      }
    }
  }, []);

  //DRAWINGS LOGIC
  const engine1Ref = useRef(new DrawingEngine());
  const engine2Ref = useRef(new DrawingEngine());
  // Each chart gets its own independent UI state
  const [drawingUi1, setDrawingUi1] = useState({
    mode: 'select', cursor: 'default', status: '', count: 0, selectedId: null,
  });
  const [drawingUi2, setDrawingUi2] = useState({
    mode: 'select', cursor: 'default', status: '', count: 0, selectedId: null,
  });

  engine1Ref.current.onUpdate = setDrawingUi1;
  engine2Ref.current.onUpdate = setDrawingUi2;

  // A helper so toolbar buttons and keyboard shortcuts broadcast to both
  const bothEngines = useCallback((fn) => {
    fn(engine1Ref.current);
    fn(engine2Ref.current);
  }, []);


  // REMOVE the old init effect entirely and replace with:
  useEffect(() => {
    if (!chartsReady) return;
    const c1 = chartRefs.current.c1;
    const c2 = chartRefs.current.c2;
    const s1 = seriesRefs.current.c1C;
    const s2 = seriesRefs.current.c2C;
    if (!c1 || !c2 || !s1 || !s2) return;

    engine1Ref.current.init(c1, s1);
    engine2Ref.current.init(c2, s2);
  }, [chartsReady]);

  // Keyboard shortcuts for drawing tools
  useEffect(() => {
    const fn = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'Escape')
        bothEngines(e => e.setMode('select'));
      if (e.key === 'Delete' || e.key === 'Backspace')
        bothEngines(e => e.deleteSelected());
      if ((e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.metaKey)
        bothEngines(e => e.setMode('draw-trendline'));
      if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey)
        bothEngines(e => e.setMode('draw-rect'));
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [bothEngines]);

  // Global pointer-up so drags always end even if mouse leaves the chart

  useEffect(() => {
    const fn = () => {
      engine1Ref.current.handleMouseUp();
      engine2Ref.current.handleMouseUp();
    };
    window.addEventListener('pointerup', fn);
    return () => window.removeEventListener('pointerup', fn);
  }, []);

  // When draw panel is closed, return engine to select mode
  useEffect(() => {
    if (activePanel !== 'DRAW') {
      bothEngines(e => e.setMode('select'));
    }
  }, [activePanel]);

  // PLAYBACK
  useEffect(() => {
    if (isPlaying && currentIndex < fullData.length - 1) {
      const t = setInterval(() => setCurrentIndex(p => p + 1), playbackSpeed);
      return () => clearInterval(t);
    }
  }, [isPlaying, playbackSpeed, currentIndex, fullData.length]);

  // ================= VIEW: SIMULATOR UI SHELL (NO CHANGES BELOW HERE) =================
  return (
    <div className="flex flex-col w-full h-screen bg-[#2d2d2d] text-gray-300 font-mono overflow-hidden pt-14 relative">
      {/* TOP MENU BAR (Fixed, Horizontal Scroll) */}
      <div className="fixed top-0 left-0 right-0 h-14 bg-[#3a3a3a] border-b border-gray-600 px-2 flex items-center z-[99] shadow-md hide-scroll overflow-x-auto whitespace-nowrap gap-4">
        {/* Brand / Title / Navigation */}
        <div className="flex items-center gap-2 border-r border-gray-600 pr-3 shrink-0">
          <Activity size={18} className="text-yellow-500" />
          <span className="font-bold text-sm text-white">Lightning Simulator</span>
        </div>

        {/* Dialog Toggles */}
        <div className="flex items-center gap-2 shrink-0 border-r border-gray-600 pr-3">
          <button
            onClick={() => setActivePanel(activePanel === 'ORDER' ? null : 'ORDER')}
            className={`mt-btn px-3 py-1 text-xs gap-1 font-bold ${activePanel === 'ORDER' ? 'bg-blue-600' : 'bg-[#444]'}`}
          >
            <MousePointer2 size={14} /> Buy/Sell
          </button>
          <button onClick={() => setShowTradeDialog(true)} className="mt-btn px-3 py-1 text-xs gap-1 font-bold">
            <LayoutGrid size={14} /> Stats Panel
          </button>
          <button onClick={() => setShowToolsDialog(true)} className="mt-btn px-3 py-1 text-xs gap-1 font-bold">
            <Layers size={14} /> Tools
          </button>
          <button
            onClick={() => setActivePanel(activePanel === 'DRAW' ? null : 'DRAW')}
            className={`mt-btn px-3 py-1 text-xs gap-1 font-bold ${activePanel === 'DRAW' ? 'bg-blue-600' : 'bg-[#444]'}`}
          >
            <Pencil size={14} /> Draw
          </button>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-2 mr-2">
            <span className="text-[10px] text-gray-400 font-bold hidden sm:block">SPEED</span>
            <input type="range" min="10" max="1000" step="10" value={1010 - playbackSpeed} onChange={(e) => setPlaybackSpeed(1010 - Number(e.target.value))} className="w-20 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer" />
          </div>
          {/* <button className="mt-btn p-1 w-10" onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}><SkipBack size={16} /></button> */}
          <button className="mt-btn p-1 w-16" onClick={() => setIsPlaying(!isPlaying)}>{isPlaying ? <Pause size={16} /> : <Play size={16} />}</button>
          <button className="mt-btn p-1 w-10" onClick={() => setCurrentIndex(Math.min(fullData.length - 1, currentIndex + 1))}><SkipForward size={16} /></button>
        </div>

        {/* Lock Features */}
        {/* PREMIUM BUTTON */}
        <div className="flex items-center shrink-0">
          <button
            onClick={() => setShowUpgradeDialog(true)}
            className="mt-btn px-3 py-1 text-xs gap-1 font-bold text-yellow-500 border-yellow-700/50 hover:bg-yellow-900/30 flex items-center"
          >
            <Crown size={14} /> <span className="hidden sm:inline">Premium</span>
          </button>
        </div>

        {/* ... Close the Top Bar div ... */}
      </div>

      {/* MAIN WORKSPACE: CHARTS */}
      <div className="flex-1 w-full h-[calc(100vh-3.5rem)] flex flex-col lg:flex-row gap-1 p-1 bg-[#2d2d2d]">
        {/* Base Chart */}
        <div className="flex-1 mt-panel flex flex-col relative min-h-[50%] lg:min-h-0 h-1/2 lg:h-full chart-wrapper">
          <div className="absolute top-1 left-1 text-[10px] text-lime-400 bg-black/80 px-2 py-0.5 z-10 font-bold border border-lime-900 shadow">{c1Timeframe}x TIMEFRAME</div>
          {!isLoaded && <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm z-20 bg-black/50">Loading simulation data...</div>}
          {/* Chart 1 container — AFTER */}
          <div
            ref={container1}
            className="w-full h-full bg-black"
            style={{ touchAction: 'none', cursor: drawingUi1.cursor }}
            onPointerDown={(e) => handleChartPointer(e, 0)}
            onPointerMove={(e) => handleChartPointer(e, 0)}
          />
        </div>

        {/* Aggregated Chart */}
        <div className="flex-1 mt-panel flex flex-col relative min-h-[50%] lg:min-h-0 h-1/2 lg:h-full chart-wrapper">
          <div className="absolute top-1 left-1 text-[10px] text-cyan-400 bg-black/80 px-2 py-0.5 z-10 font-bold border border-cyan-900 shadow">{c2Timeframe}x AGGREGATED</div>
          {/* Chart 2 container — AFTER */}
          <div
            ref={container2}
            className="w-full h-full bg-black"
            style={{ touchAction: 'none', cursor: drawingUi2.cursor }}
            onPointerDown={(e) => handleChartPointer(e, 1)}
            onPointerMove={(e) => handleChartPointer(e, 1)}
          />
        </div>

        {/* DRAGGABLE ORDER PANEL */}
        <div
          ref={orderRef}
          style={{ transform: `translate(${orderPos.x}px, ${orderPos.y}px)`, position: 'absolute', zIndex: 45 }}
          // Reduced base width for mobile, normal width on sm+ screens
          className={`${activePanel === 'ORDER' ? 'flex' : 'hidden'} mt-panel w-[200px] sm:w-[220px] flex-col shadow-2xl bg-[#2d2d2d] touch-none`}
        >
          {/* Draggable Header */}
          <div
            onPointerDown={(e) => handlePointerDown(e, 'ORDER')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="flex justify-between items-center p-2 bg-[#222] border-b border-[#555] cursor-move select-none"
          >
            <div className="flex items-center gap-1 text-[10px] font-bold text-yellow-500">
              <MousePointer2 size={12} /> ORDER PANEL
            </div>
            <button className="text-gray-400 hover:text-white" onPointerDown={(e) => e.stopPropagation()} onClick={() => setActivePanel(null)}>
              <X size={14} />
            </button>
          </div>

          {/* Body */}
          {/* Tighter gap and padding for mobile fit */}
          <div className="p-1.5 sm:p-2 flex flex-col gap-1.5 pointer-events-auto">

            {/* Dynamic Mode Label */}
            <div className="text-center text-[10px] sm:text-xs font-bold text-blue-400 bg-[#1a1a1a] py-1 rounded border border-[#444]">
              {orderModeLabel}
            </div>

            <div className="flex justify-between text-[10px] sm:text-xs text-white">
              <span>Price:</span> <span className="font-bold">{currentPrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[10px] sm:text-xs text-white">
              <span>Live PnL:</span> <span className={`font-bold ${openPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>{openPnL.toFixed(2)}</span>
            </div>

            {/* Expand Advanced Orders Button */}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-[9px] sm:text-[10px] text-gray-300 hover:text-white bg-[#333] border border-[#555] rounded py-0.5 mt-0.5"
            >
              {isExpanded ? '▲ Hide Advanced' : '▼ Advanced Options'}
            </button>

            {/* Expanded Advanced Section */}
            {isExpanded && (
              <div className="flex flex-col gap-1.5 bg-[#222] p-1.5 rounded border border-[#444]">
                {/* Checkboxes */}
                <div className="flex justify-between gap-1 text-[9px] sm:text-[10px] text-white">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isMarket}
                      onChange={e => setIsMarket(e.target.checked)}
                      className="accent-blue-600 w-3 h-3"
                    />
                    Market price
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isTrigger}
                      onChange={e => setIsTrigger(e.target.checked)}
                      className="accent-blue-600 w-3 h-3"
                    />
                    Trigger price
                  </label>
                </div>

                {/* Number Fields for Limits/Triggers */}
                <div className="flex gap-1">
                  <input
                    type="number"
                    step="0.05"
                    disabled={isMarket} // Disabled if market order
                    value={limitPrice}                      // Added
                    onChange={e => setLimitPrice(e.target.value)} // Added
                    className="mt-inset w-full text-white p-1 text-[10px] sm:text-xs text-center disabled:opacity-30 disabled:cursor-not-allowed"
                    placeholder="Limit Px"
                  />
                  <input
                    type="number"
                    step="0.05"
                    disabled={!isTrigger} // Disabled if trigger is off
                    value={triggerPrice}                    // Added
                    onChange={e => setTriggerPrice(e.target.value)} // Added
                    className="mt-inset w-full text-white p-1 text-[10px] sm:text-xs text-center disabled:opacity-30 disabled:cursor-not-allowed"
                    placeholder="Trigger Px"
                  />
                </div>
              </div>
            )}

            {/* Volume/Qty */}
            {/* Slightly smaller padding on mobile to save vertical space */}
            <input
              type="number"
              step="0.01"
              value={qtyInput}
              onChange={e => setQtyInput(+e.target.value)}
              className="mt-inset w-full text-white p-1 sm:p-1.5 text-xs sm:text-sm font-bold text-center"
              placeholder="Volume"
            />

            {/* Action Buttons */}
            {/* Reduced py to fit better on small screens */}
            <div className="grid grid-cols-2 gap-1 mt-0.5">
              <button onClick={() => executeOrder('SELL')} className="mt-btn mt-btn-red py-2 sm:py-3 text-xs sm:text-sm font-black">SELL</button>
              <button onClick={() => executeOrder('BUY')} className="mt-btn mt-btn-green py-2 sm:py-3 text-xs sm:text-sm font-black">BUY</button>
            </div>

            {/* Added Close All Button */}
            <button onClick={closeAllPositions} className="mt-btn w-full mt-0.5 bg-[#444] text-white border-[#666] py-1 text-[10px] sm:text-xs font-bold hover:bg-red-800 hover:text-white">
              CLOSE ALL
            </button>
          </div>
        </div>

        {/* DRAGGABLE DRAW PANEL (TRADINGVIEW STYLE) */}
        <div
          ref={drawRef}
          style={{ transform: `translate(${drawPos.x}px, ${drawPos.y}px)`, position: 'absolute', zIndex: 45 }}
          // Reduced width to 48px to act as a slim vertical toolbar
          className={`${activePanel === 'DRAW' ? 'flex' : 'hidden'} mt-panel w-[48px] flex-col shadow-2xl bg-[#2d2d2d] touch-none border border-[#444] rounded-md overflow-hidden`}
        >
          {/* Draggable Drag-Handle (Top Area) */}
          <div
            onPointerDown={(e) => handlePointerDown(e, 'DRAW')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="flex justify-center items-center py-2 bg-[#222] border-b border-[#555] cursor-move select-none"
            title="Drag Toolbar"
          >
            {/* Small grip dots or icon to indicate drag */}
            <div className="flex gap-[2px]">
              <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
              <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
              <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
            </div>
          </div>

          {/* Body - Icon Stack */}
          <div className="p-1 flex flex-col gap-1 pointer-events-auto items-center">
            <button
              title="Press Esc"
              onClick={() => bothEngines(e => e.setMode('select'))}
              className={`p-2 rounded transition-colors ${drawingUi1.mode === 'select'
                ? 'bg-[#444] text-white'
                : 'hover:bg-[#444] text-gray-300 hover:text-white'
                }`}
            >
              <MousePointer2 size={16} />
            </button>

            <button
              title="Press T"
              onClick={() => bothEngines(e => e.setMode('draw-trendline'))}
              className={`p-2 rounded transition-colors ${drawingUi1.mode === 'draw-trendline'
                ? 'bg-blue-900/60 text-blue-400'
                : 'hover:bg-[#444] text-gray-300 hover:text-white'
                }`}
            >
              <TrendingUp size={16} />
            </button>

            <button
              title="Press R" onClick={() => bothEngines(e => e.setMode('draw-rect'))}
              className={`p-2 rounded transition-colors ${drawingUi1.mode === 'draw-rect'
                ? 'bg-purple-900/60 text-purple-400'
                : 'hover:bg-[#444] text-gray-300 hover:text-white'
                }`}
            >
              <Square size={16} />
            </button>

            <div className="w-full h-[1px] bg-[#555] my-1" />

            <button
              title="Delete Selected"
              onClick={() => bothEngines(e => e.deleteSelected())}
              disabled={drawingUi1.selectedId == null && drawingUi2.selectedId == null}
              className="p-2 rounded transition-colors hover:bg-red-900/50 text-gray-300 hover:text-red-400 disabled:opacity-25 disabled:cursor-not-allowed"
            >
              <Trash2 size={16} />
            </button>

            <button
              title="Clear All"
              onClick={() => bothEngines(e => e.deleteAll())}
              disabled={drawingUi1.count === 0 && drawingUi2.count === 0}
              className="p-2 rounded transition-colors hover:bg-red-900/50 text-gray-300 hover:text-red-400 disabled:opacity-25 disabled:cursor-not-allowed"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* TRADE PANEL DIALOG */}
      <div className={`${showTradeDialog ? 'flex' : 'hidden'} fixed inset-0 z-50 bg-black/60 backdrop-blur-sm items-center justify-center p-2`}>
        <div className="mt-panel w-[95%] max-w-[450px] max-h-[90vh] flex flex-col shadow-2xl bg-[#2d2d2d]">

          <div className="flex justify-between items-center p-2 bg-[#222] border-b border-[#555] shrink-0">
            <div className="flex items-center gap-1 text-xs font-bold text-yellow-500">
              <LayoutGrid size={14} /> Trade Manager
            </div>
            <button className="mt-btn p-0.5 bg-gray-400 hover:bg-red-400 text-black" onClick={() => setShowTradeDialog(false)}><X size={16} /></button>
          </div>

          <div className="flex bg-[#333] border-b border-[#555] shrink-0 text-[11px] font-bold">
            <div className={`mt-tab flex-1 text-center py-2 cursor-pointer ${activeTab === 'trade' ? 'bg-[#222] text-blue-400 border-b-2 border-blue-500' : 'text-gray-400 hover:bg-[#444]'}`} onClick={() => setActiveTab('trade')}>Position</div>
            <div className={`mt-tab flex-1 text-center py-2 cursor-pointer ${activeTab === 'orders' ? 'bg-[#222] text-blue-400 border-b-2 border-blue-500' : 'text-gray-400 hover:bg-[#444]'}`} onClick={() => setActiveTab('orders')}>Orders ({pendingOrders.length})</div>
            <div className={`mt-tab flex-1 text-center py-2 cursor-pointer ${activeTab === 'history' ? 'bg-[#222] text-blue-400 border-b-2 border-blue-500' : 'text-gray-400 hover:bg-[#444]'}`} onClick={() => setActiveTab('history')}>History</div>
            <div className={`mt-tab flex-1 text-center py-2 cursor-pointer ${activeTab === 'performance' ? 'bg-[#222] text-blue-400 border-b-2 border-blue-500' : 'text-gray-400 hover:bg-[#444]'}`} onClick={() => setActiveTab('performance')}>Stats</div>
          </div>

          <div className="flex-1 overflow-y-auto bg-[#222] p-1 text-xs flex flex-col min-h-[250px]">

            {/* Position Tab */}
            <div className={activeTab === 'trade' ? 'block' : 'hidden'}>
              <table className="w-full text-left">
                <thead className="text-gray-400 sticky top-0 bg-[#222]">
                  <tr><th className="p-1">Net Pos</th><th className="p-1">Size</th><th className="p-1">Avg Px</th><th className="p-1 text-right">Unrealized</th><th className="p-1 text-center">Close</th></tr>
                </thead>
                <tbody>
                  {activePositions.length === 0 && <tr><td colSpan="5" className="text-center p-4 text-gray-500">No open positions.</td></tr>}
                  {activePositions.map(pos => {
                    const pnl = (currentPrice - pos.price) * pos.qty * (pos.type === 'BUY' ? 1 : -1);
                    return (
                      <tr key={pos.id} className="border-b border-gray-800">
                        <td className={`p-1 font-bold ${pos.type === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>{pos.type === 'BUY' ? 'LONG' : 'SHORT'}</td>
                        <td className="p-1">{pos.qty.toFixed(2)}</td>
                        <td className="p-1">{pos.price.toFixed(2)}</td>
                        <td className={`p-1 text-right font-bold ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>{pnl.toFixed(2)}</td>
                        <td className="p-1 text-center">
                          <button className="bg-red-900/50 hover:bg-red-600 text-white px-2 py-0.5 rounded text-[10px]" onClick={() => closePosition(pos.id)}>EXIT</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* NEW: Pending Orders Tab */}
            <div className={activeTab === 'orders' ? 'block' : 'hidden'}>
              <table className="w-full text-left text-[10px]">
                <thead className="text-gray-400 sticky top-0 bg-[#222]">
                  <tr><th className="p-1">Typ</th><th className="p-1">Mode</th><th className="p-1">Trg Px</th><th className="p-1">Lmt Px</th><th className="p-1">Qty</th><th className="p-1 text-center">X</th></tr>
                </thead>
                <tbody>
                  {pendingOrders.length === 0 && <tr><td colSpan="6" className="text-center p-4 text-gray-500">No pending orders.</td></tr>}
                  {pendingOrders.map(order => (
                    <tr key={order.id} className="border-b border-gray-800">
                      <td className={`p-1 font-bold ${order.type === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>{order.type.charAt(0)}</td>
                      <td className="p-1 truncate max-w-[80px]" title={order.mode}>{order.mode.replace('Intraday - ', '')}</td>
                      <td className="p-1">{order.triggerPx ? order.triggerPx.toFixed(2) : '-'}</td>
                      <td className="p-1">{order.limitPx ? order.limitPx.toFixed(2) : '-'}</td>
                      <td className="p-1">{order.qty}</td>
                      <td className="p-1 text-center">
                        <X size={14} className="cursor-pointer text-red-400 hover:text-red-300 mx-auto" onClick={() => cancelOrder(order.id)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* History Tab */}
            <div className={activeTab === 'history' ? 'block' : 'hidden'}>
              <table className="w-full text-left text-[10px]">
                <thead className="text-gray-400 sticky top-0 bg-[#222]">
                  <tr><th className="p-1">Typ</th><th className="p-1">Size</th><th className="p-1">Entry</th><th className="p-1">Exit</th><th className="p-1 text-right">Realized</th></tr>
                </thead>
                <tbody>
                  {closedHistory.length === 0 && <tr><td colSpan="5" className="text-center p-4 text-gray-500">No history yet.</td></tr>}
                  {closedHistory.map((pos, idx) => (
                    <tr key={idx} className="border-b border-gray-800">
                      <td className={`p-1 font-bold ${pos.type === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>{pos.type.charAt(0)}</td>
                      <td className="p-1">{pos.qty?.toFixed(2) || '-'}</td>
                      <td className="p-1">{pos.price.toFixed(2)}</td>
                      <td className="p-1">{pos.exitPrice.toFixed(2)}</td>
                      <td className={`p-1 text-right font-bold ${pos.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{pos.profit.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Performance Tab */}
            <div className={`${activeTab === 'performance' ? 'flex' : 'hidden'} p-2 space-y-2 flex-col flex-1 h-full`}>
              <div className="flex justify-between border-b border-gray-700 pb-1"><span>Total Trades:</span> <span className="font-bold text-white">{totalTrades}</span></div>
              <div className="flex justify-between border-b border-gray-700 pb-1"><span>Starting Bal:</span> <span className="font-bold text-gray-400">${balance.toFixed(2)}</span></div>
              <div className="flex justify-between border-b border-gray-700 pb-1"><span>Current Bal:</span> <span className="font-bold text-white">${(equityHistory.length > 0 ? equityHistory[equityHistory.length - 1].value : balance).toFixed(2)}</span></div>
              <div className="flex justify-between border-b border-gray-700 pb-1"><span>Net PnL:</span> <span className={`font-bold ${netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>${netProfit.toFixed(2)}</span></div>
              <div className="flex justify-between border-b border-gray-700 pb-1"><span>Win Rate:</span> <span className="font-bold text-white">{winRate}%</span></div>
              <div className="mt-2 flex-1 min-h-[120px] mt-panel relative chart-wrapper bg-black p-2">
                <div className="absolute top-0 left-0 text-[9px] text-blue-400 bg-black/80 px-1 z-10 font-bold border-b border-r border-blue-900">EQUITY</div>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                  <path d={areaPath} fill="rgba(59, 130, 246, 0.2)" stroke="none" />
                  <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                </svg>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* TOOLS DIALOG */}
      <div className={`${showToolsDialog ? 'flex' : 'hidden'} fixed inset-0 z-50 bg-black/60 backdrop-blur-sm items-center justify-center p-2`}>
        <div className="mt-panel w-[95%] max-w-[320px] max-h-[90vh] flex flex-col shadow-2xl bg-[#2d2d2d]">
          <div className="flex justify-between items-center p-2 bg-[#222] border-b border-[#555] shrink-0">
            <div className="flex items-center gap-1 text-xs font-bold text-white"><Layers size={14} /> Tools & Indicators</div>
            <button className="mt-btn p-0.5 bg-gray-400 hover:bg-red-400 text-black" onClick={() => setShowToolsDialog(false)}><X size={16} /></button>
          </div>
          <div className="p-3 overflow-y-auto space-y-3 bg-[#222]">
            <div className="space-y-3 bg-[#2d2d2d] p-3 border border-gray-700">
              <h3 className="font-bold text-gray-400 text-[10px] uppercase mb-1">Base Chart</h3>
              <div className="flex bg-[#222] rounded overflow-hidden border border-gray-600 mb-2">
                {[1, 3, 5, 15, 60, 240].map(tf => (
                  <button key={tf} onClick={() => setC1Timeframe(tf)} className={`flex-1 text-[10px] py-1 text-center font-bold ${c1Timeframe === tf ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-[#333]'}`} >
                    {tf}x
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2 text-xs">
                <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap text-gray-300">
                  <input type="checkbox" checked={c1Ma.visible} onChange={() => setC1Ma({ ...c1Ma, visible: !c1Ma.visible })} /> SMA Length:
                </label>
                <input type="number" min="1" max="500" value={c1Ma.period} onChange={(e) => setC1Ma({ ...c1Ma, period: parseInt(e.target.value) || 1 })} className="mt-inset w-16 text-white p-1 text-center font-bold" />
              </div>
              <div className="flex flex-col gap-2 text-xs">
                <label className="flex items-center gap-2 cursor-pointer text-gray-300">
                  <input type="checkbox" checked={c1Bb.visible} onChange={() => setC1Bb({ ...c1Bb, visible: !c1Bb.visible })} /> Bollinger Bands
                </label>
                {c1Bb.visible && (
                  <div className="flex items-center justify-between gap-1 pl-6">
                    <span className="text-[10px] text-gray-400">Len:</span>
                    <input type="number" min="1" value={c1Bb.period} onChange={(e) => setC1Bb({ ...c1Bb, period: parseInt(e.target.value) || 1 })} className="mt-inset w-12 text-white p-1 text-center" />
                    <span className="text-[10px] text-gray-400">Std:</span>
                    <input type="number" step="0.1" value={c1Bb.std} onChange={(e) => setC1Bb({ ...c1Bb, std: parseFloat(e.target.value) || 1 })} className="mt-inset w-12 text-white p-1 text-center" />
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3 bg-[#2d2d2d] p-3 border border-gray-700">
              <h3 className="font-bold text-gray-400 text-[10px] uppercase mb-1">Aggregated Chart</h3>
              <div className="flex bg-[#222] rounded overflow-hidden border border-gray-600 mb-2">
                {[1, 3, 5, 15, 60, 240].map(tf => (
                  <button key={tf} onClick={() => setC2Timeframe(tf)} className={`flex-1 text-[10px] py-1 text-center font-bold ${c2Timeframe === tf ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-[#333]'}`} >
                    {tf}x
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2 text-xs">
                <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap text-gray-300">
                  <input type="checkbox" checked={c2Ma.visible} onChange={() => setC2Ma({ ...c2Ma, visible: !c2Ma.visible })} /> SMA Length:
                </label>
                <input type="number" min="1" max="500" value={c2Ma.period} onChange={(e) => setC2Ma({ ...c2Ma, period: parseInt(e.target.value) || 1 })} className="mt-inset w-16 text-white p-1 text-center font-bold" />
              </div>
            </div>

            {/* NEW: GLOBAL SETTINGS */}
            <div className="space-y-2 bg-[#2d2d2d] p-3 border border-gray-700">
              <h3 className="font-bold text-gray-400 text-[10px] uppercase mb-1">Global Settings</h3>
              <label className="flex items-center gap-2 text-xs cursor-pointer text-gray-300">
                <input
                  type="checkbox"
                  checked={showMarkers}
                  onChange={() => setShowMarkers(!showMarkers)}
                />
                Show Buy/Sell Chart Markers
              </label>
            </div>

          </div>
        </div>
      </div>

      {/* PREMIUM FEATURES DIALOG */}
      <div className={`${showUpgradeDialog ? 'flex' : 'hidden'} fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm items-center justify-center p-4`}>
        <div className="mt-panel w-full max-w-[360px] flex flex-col shadow-2xl bg-[#2d2d2d] border-yellow-600/30">

          {/* Header */}
          <div className="flex justify-between items-center p-4 bg-[#222] border-b border-gray-700">
            <div className="flex items-center gap-2 text-sm font-bold text-yellow-500">
              <Crown size={18} /> PREMUM FEATURES
            </div>
            <button className="text-gray-400 hover:text-white" onClick={() => setShowUpgradeDialog(false)}><X size={20} /></button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4">
            <p className="text-xs text-gray-400 leading-relaxed uppercase tracking-wider font-bold">
              The following features are available in the Pro Version:
            </p>

            <div className="grid grid-cols-1 gap-2">
              {[
                "4 Multi-Chart Layout",
                "BTCUSD, EURUSD & Global Assets",
                "Custom indicators",
                "Customize Performance Dashboard"
              ].map((feat, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-black/30 border border-gray-800 rounded text-sm text-gray-200">
                  <Lock size={14} className="text-gray-600" />
                  {feat}
                </div>
              ))}
            </div>

            <div className="pt-4 flex flex-col gap-2">
              <button
                onClick={() => { setShowUpgradeDialog(false); navigate("/page2"); }}
                className="mt-btn w-full py-3 text-sm font-bold bg-yellow-600/20 text-yellow-500 border-yellow-600 hover:bg-yellow-600/40"
              >
                UPGRADE NOW
              </button>
              <button
                onClick={() => setShowUpgradeDialog(false)}
                className="w-full py-2 text-[10px] text-gray-500 hover:text-gray-300 font-bold tracking-widest"
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Page1;
