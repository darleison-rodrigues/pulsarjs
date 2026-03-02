import React, { useState, useEffect } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
    PieChart, Pie, Cell
} from 'recharts';
import {
    LayoutDashboard, Search, Settings, Calendar, Tag, Box,
    Download, ChevronDown, ArrowUp, Sparkles, Globe,
    Activity, ArrowUpRight, ArrowDownRight, AlignLeft, Hash
} from 'lucide-react';

// --- MOCK CLICKHOUSE DATA (Adapted for the new layout) ---
const mockLineData = [
    { name: 'Jan', brandA: 72, brandB: 66, brandC: 53, brandD: 47, brandE: 39 },
    { name: 'Feb', brandA: 74, brandB: 68, brandC: 51, brandD: 45, brandE: 42 },
    { name: 'Mar', brandA: 71, brandB: 67, brandC: 55, brandD: 48, brandE: 38 },
    { name: 'Apr', brandA: 75, brandB: 70, brandC: 52, brandD: 46, brandE: 40 },
    { name: 'May', brandA: 78, brandB: 71, brandC: 58, brandD: 43, brandE: 35 },
    { name: 'Jun', brandA: 82, brandB: 75, brandC: 60, brandD: 45, brandE: 33 },
];

const mockCompetitors = [
    { id: 1, brand: 'HubSpot', visibility: '65%', visTrend: null, sentiment: 86, senTrend: null, position: '#2.7', posTrend: null, color: '#F59E0B' },
    { id: 2, brand: 'Salesforce', visibility: '62%', visTrend: null, sentiment: 62, senTrend: 'down', senVal: '0.2', position: '#2.9', posTrend: 'down', posVal: '0.1', color: '#3B82F6' },
    { id: 3, brand: 'Attio', visibility: '47%', visTrend: 'up', visVal: '0.3', sentiment: 89, senTrend: null, position: '#3.6', posTrend: null, color: '#0F172A' },
    { id: 4, brand: 'Pipedrive', visibility: '41%', visTrend: 'down', visVal: '0.3', sentiment: 76, senTrend: null, position: '#3.9', posTrend: null, color: '#10B981' },
    { id: 5, brand: 'Zero', visibility: '28%', visTrend: null, sentiment: 88, senTrend: 'up', senVal: '0.4', position: '#2.3', posTrend: 'up', posVal: '0.2', color: '#6366F1' },
];

const mockDomains = [
    { id: 1, domain: 'reddit.com', type: 'UGC', used: '32%', avg: '41%' },
    { id: 2, domain: 'techradar.com', type: 'Editorial', used: '43%', avg: '46%' },
    { id: 3, domain: 'wikipedia.org', type: 'Knowledge', used: '18%', avg: '22%' },
    { id: 4, domain: 'youtube.com', type: 'UGC', used: '55%', avg: '60%' },
    { id: 5, domain: 'google.com', type: 'Search', used: '89%', avg: '92%' },
];

const mockDonutData = [
    { name: 'UGC', value: 45, color: '#6366F1' },
    { name: 'Editorial', value: 25, color: '#3B82F6' },
    { name: 'Corporate', value: 15, color: '#8B5CF6' },
    { name: 'Competitor', value: 10, color: '#EC4899' },
    { name: 'Others', value: 5, color: '#E5E7EB' },
];

// --- STYLESHEET INJECTION (Updated for Soft Modern Aesthetic) ---
const globalStyles = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

:root {
    --color-primary: #6366F1;
    --color-secondary: #818CF8;
    --color-signal: #2DD4BF;
    --color-success: #10B981;
    --color-danger: #EF4444;
    --color-warning: #F59E0B;
    --color-bg: #F9FAFB;
    --color-surface: #FFFFFF;
    --color-ink: #111827;
    --color-ink-60: #4B5563;
    --color-ink-40: #9CA3AF;
    --color-border: #E5E7EB;

    --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
}

body {
    background-color: var(--color-bg);
    color: var(--color-ink);
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
}

/* Custom Scrollbar */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 10px; }
::-webkit-scrollbar-thumb:hover { background: #D1D5DB; }

.widget {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 16px;
    box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05);
    overflow: hidden;
}

.table-row {
    border-bottom: 1px solid var(--color-border);
    transition: background-color 0.15s ease;
}
.table-row:hover {
    background-color: #F9FAFB;
}
.table-row:last-child {
    border-bottom: none;
}

.badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 500;
}
.badge-blue { background: #EFF6FF; color: #2563EB; }
.badge-orange { background: #FFF7ED; color: #EA580C; }
.badge-gray { background: #F3F4F6; color: #4B5563; }

.nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    border-radius: 8px;
    color: var(--color-ink-60);
    font-size: 13px;
    font-weight: 500;
    transition: all 0.15s;
    cursor: pointer;
}
.nav-item:hover {
    background: #F3F4F6;
    color: var(--color-ink);
}
.nav-item.active {
    background: #F3F4F6;
    color: var(--color-ink);
    font-weight: 600;
}

.top-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 999px;
    font-size: 13px;
    font-weight: 500;
    color: var(--color-ink-60);
    cursor: pointer;
    transition: all 0.15s;
}
.top-pill:hover {
    background: #F9FAFB;
    color: var(--color-ink);
}

.action-button {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 6px;
    color: var(--color-ink-60);
    cursor: pointer;
    transition: all 0.1s;
}
.action-button:hover {
    background: #F3F4F6;
    color: var(--color-ink);
}

.floating-prompt {
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
}
`;

// --- COMPONENTS ---

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-[#111827] border border-gray-700 rounded-xl p-4 shadow-xl min-w-[200px]">
                <p className="text-white text-sm font-semibold mb-3">{`January 2025`}</p>
                <div className="space-y-2.5">
                    {payload.map((entry, index) => (
                        <div key={index} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                                <div
                                    className="w-3 h-3 rounded-md flex items-center justify-center text-[8px] text-white"
                                    style={{ backgroundColor: entry.color }}
                                >
                                    {/* Mock icons for brands */}
                                    {index === 0 ? 'S' : index === 1 ? 'A' : index === 2 ? 'H' : index === 3 ? 'Z' : 'P'}
                                </div>
                                <span className="text-gray-300">
                                    {index === 0 ? 'Salesforce' : index === 1 ? 'Attio' : index === 2 ? 'HubSpot' : index === 3 ? 'Zero' : 'Pipedrive'}
                                </span>
                            </div>
                            <span className="text-white font-medium">{entry.value}%</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }
    return null;
};

const TrendIndicator = ({ trend, value }) => {
    if (!trend) return null;
    const isUp = trend === 'up';
    return (
        <span className={`flex items-center text-[10px] ml-1.5 font-medium ${isUp ? 'text-emerald-500' : 'text-rose-500'}`}>
            {isUp ? <ArrowUpRight className="w-3 h-3 mr-0.5" /> : <ArrowDownRight className="w-3 h-3 mr-0.5" />}
            {value}
        </span>
    );
};

// --- MAIN APP COMPONENT ---

export default function App() {
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Simulate initial data load
        const timer = setTimeout(() => setLoading(false), 800);
        return () => clearTimeout(timer);
    }, []);

    return (
        <>
            <style>{globalStyles}</style>

            <div className="flex h-screen bg-[#F9FAFB] overflow-hidden relative">

                {/* SIDEBAR */}
                <aside className="w-[240px] bg-white border-r border-gray-200 flex flex-col z-10 shrink-0">
                    <div className="p-4 flex items-center gap-2.5">
                        <div className="w-7 h-7 bg-[#111827] rounded-lg flex items-center justify-center">
                            <Sparkles className="w-4 h-4 text-white" />
                        </div>
                        <span className="font-semibold text-[15px] text-gray-900 tracking-tight">Analytics Dashboard</span>
                    </div>

                    <div className="px-3 pb-2 mt-2">
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Quick Actions"
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-9 pr-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                            />
                        </div>
                    </div>

                    <div className="px-3 py-4 flex-1 overflow-y-auto">
                        <div className="text-[11px] font-medium text-gray-400 mb-2 px-2">Pages</div>
                        <div className="space-y-0.5">
                            <div className="nav-item active">
                                <LayoutDashboard className="w-4 h-4" /> Overview
                            </div>
                            <div className="nav-item">
                                <AlignLeft className="w-4 h-4" /> Prompts
                            </div>
                            <div className="nav-item">
                                <Globe className="w-4 h-4" /> Sources
                            </div>
                            <div className="nav-item">
                                <Box className="w-4 h-4" /> Models
                            </div>
                            <div className="nav-item mt-4">
                                <Settings className="w-4 h-4" /> Settings
                            </div>
                        </div>
                    </div>
                </aside>

                {/* MAIN CONTENT */}
                <main className="flex-1 flex flex-col h-screen overflow-hidden relative">

                    {/* TOP BAR */}
                    <header className="h-[60px] bg-white/80 backdrop-blur-md border-b border-gray-200 flex items-center justify-between px-6 shrink-0 z-10">
                        <div className="flex items-center gap-3">
                            <div className="w-6 h-6 bg-indigo-600 rounded-md flex items-center justify-center">
                                <Activity className="w-3.5 h-3.5 text-white" />
                            </div>
                            <div className="top-pill">
                                <Calendar className="w-4 h-4" /> Last 7 days
                            </div>
                            <div className="top-pill">
                                <Tag className="w-4 h-4" /> All tags
                            </div>
                            <div className="top-pill">
                                <Box className="w-4 h-4" /> All Models
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <button className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">
                                <span className="text-xs font-medium">?</span>
                            </button>
                            <button className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                                <Download className="w-4 h-4 text-gray-400" /> Export
                            </button>
                        </div>
                    </header>

                    {/* SCROLLABLE DASHBOARD AREA */}
                    <div className="flex-1 overflow-y-auto p-6 relative z-0">
                        <div className="max-w-[1200px] mx-auto pb-24">

                            {/* PAGE HEADER INFO */}
                            <div className="flex justify-between items-center mb-4 px-1">
                                <div className="flex items-center gap-2 text-sm">
                                    <span className="text-gray-500 flex items-center gap-1.5"><LayoutDashboard className="w-4 h-4" /> Overview</span>
                                    <span className="text-gray-300">•</span>
                                    <span className="text-gray-900 font-medium">Attio's Visibility trending up by 5.2% this month</span>
                                </div>
                                <div className="flex items-center gap-4 text-xs font-medium text-gray-500">
                                    <span className="flex items-center">Visibility: <span className="text-gray-900 ml-1">3/14</span> <ArrowDownRight className="w-3 h-3 text-rose-500 ml-0.5" /></span>
                                    <span className="text-gray-300">•</span>
                                    <span className="flex items-center">Sentiment: <span className="text-gray-900 ml-1">2/14</span> <ArrowUpRight className="w-3 h-3 text-emerald-500 ml-0.5" /></span>
                                    <span className="text-gray-300">•</span>
                                    <span className="flex items-center">Position: <span className="text-gray-900 ml-1">5/14</span> <ArrowUpRight className="w-3 h-3 text-emerald-500 ml-0.5" /></span>
                                </div>
                            </div>

                            {/* DASHBOARD GRID */}
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

                                {/* MAIN CHART (Spans 2 columns) */}
                                <div className="widget lg:col-span-2 flex flex-col p-1">
                                    {/* Chart Header Tabs */}
                                    <div className="flex justify-between items-center p-3 border-b border-gray-100">
                                        <div className="flex gap-1">
                                            <button className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg text-sm font-semibold text-gray-900">
                                                <Activity className="w-4 h-4" /> Visibility
                                            </button>
                                            <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-50 rounded-lg transition-colors">
                                                <Sparkles className="w-4 h-4" /> Sentiment
                                            </button>
                                            <button className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-50 rounded-lg transition-colors">
                                                <Hash className="w-4 h-4" /> Position
                                            </button>
                                        </div>
                                        <div className="flex gap-2 pr-2">
                                            <button className="action-button"><ArrowDownRight className="w-4 h-4" /></button>
                                            <button className="action-button"><Activity className="w-4 h-4" /></button>
                                        </div>
                                    </div>

                                    {/* Chart Area */}
                                    <div className="flex-1 p-4 min-h-[280px]">
                                        {loading ? (
                                            <div className="w-full h-full animate-pulse bg-gray-50 rounded-xl"></div>
                                        ) : (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <LineChart data={mockLineData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} dy={10} />
                                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} />
                                                    <RechartsTooltip content={<CustomTooltip />} cursor={{ stroke: '#E5E7EB', strokeWidth: 1, strokeDasharray: '4 4' }} />
                                                    <Line type="monotone" dataKey="brandA" stroke="#3B82F6" strokeWidth={2.5} dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: '#3B82F6' }} />
                                                    <Line type="monotone" dataKey="brandB" stroke="#6366F1" strokeWidth={2.5} dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: '#6366F1' }} />
                                                    <Line type="monotone" dataKey="brandC" stroke="#F59E0B" strokeWidth={2.5} dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: '#F59E0B' }} />
                                                    <Line type="monotone" dataKey="brandD" stroke="#10B981" strokeWidth={2.5} dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: '#10B981' }} />
                                                    <Line type="monotone" dataKey="brandE" stroke="#111827" strokeWidth={2.5} dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: '#111827' }} />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        )}
                                    </div>
                                </div>

                                {/* COMPETITORS TABLE */}
                                <div className="widget flex flex-col">
                                    <div className="p-5 border-b border-gray-100 flex justify-between items-start">
                                        <div>
                                            <h3 className="font-semibold text-[15px] text-gray-900">Attio's competitors</h3>
                                            <p className="text-[13px] text-gray-500 mt-0.5">Compare Attio with its competitors</p>
                                        </div>
                                        <button className="action-button"><ArrowUpRight className="w-4 h-4" /></button>
                                    </div>

                                    <div className="flex-1 overflow-x-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="border-b border-gray-100">
                                                    <th className="py-3 px-4 text-xs font-medium text-gray-400 font-sans">#</th>
                                                    <th className="py-3 px-4 text-xs font-medium text-gray-400 font-sans">Brand</th>
                                                    <th className="py-3 px-4 text-xs font-medium text-gray-400 font-sans flex items-center justify-between">Visibility <ChevronDown className="w-3 h-3" /></th>
                                                    <th className="py-3 px-4 text-xs font-medium text-gray-400 font-sans">Sentiment</th>
                                                    <th className="py-3 px-4 text-xs font-medium text-gray-400 font-sans">Position</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {loading ? (
                                                    [...Array(5)].map((_, i) => (
                                                        <tr key={i} className="table-row">
                                                            <td colSpan="5" className="px-4 py-3"><div className="h-4 bg-gray-100 rounded w-full animate-pulse"></div></td>
                                                        </tr>
                                                    ))
                                                ) : (
                                                    mockCompetitors.map((comp, i) => (
                                                        <tr key={comp.id} className="table-row text-[13px]">
                                                            <td className="py-3 px-4 text-gray-400">{i + 1}</td>
                                                            <td className="py-3 px-4">
                                                                <div className="flex items-center gap-2 font-medium text-gray-900">
                                                                    <div className="w-4 h-4 rounded-[4px] flex items-center justify-center text-[8px] text-white" style={{ backgroundColor: comp.color }}>
                                                                        {comp.brand.charAt(0)}
                                                                    </div>
                                                                    {comp.brand}
                                                                </div>
                                                            </td>
                                                            <td className="py-3 px-4 font-medium text-gray-700">
                                                                <div className="flex items-center">
                                                                    {comp.visibility}
                                                                    <TrendIndicator trend={comp.visTrend} value={comp.visVal} />
                                                                </div>
                                                            </td>
                                                            <td className="py-3 px-4">
                                                                <div className="flex items-center">
                                                                    <span className="w-0.5 h-3 bg-emerald-400 rounded-full mr-2"></span>
                                                                    <span className="font-medium text-gray-700">{comp.sentiment}</span>
                                                                    <TrendIndicator trend={comp.senTrend} value={comp.senVal} />
                                                                </div>
                                                            </td>
                                                            <td className="py-3 px-4">
                                                                <div className="flex items-center">
                                                                    <span className="text-gray-400 mr-1 text-[10px]">#</span>
                                                                    <span className="font-medium text-gray-700">{comp.position.replace('#', '')}</span>
                                                                    <TrendIndicator trend={comp.posTrend} value={comp.posVal} />
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* DOMAINS TABLE */}
                                <div className="widget lg:col-span-2 flex flex-col">
                                    <div className="flex gap-4 p-2 px-3 border-b border-gray-100">
                                        <button className="px-3 py-1.5 bg-gray-100 rounded-lg text-sm font-semibold text-gray-900">Domains</button>
                                        <button className="px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-50 rounded-lg transition-colors">URLs</button>
                                    </div>

                                    <div className="flex-1 overflow-x-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="border-b border-gray-100">
                                                    <th className="py-3 px-4 text-xs font-medium text-gray-400 w-10">#</th>
                                                    <th className="py-3 px-4 text-xs font-medium text-gray-400">Domain</th>
                                                    <th className="py-3 px-4 text-xs font-medium text-gray-400">Type</th>
                                                    <th className="py-3 px-4 text-xs font-medium text-gray-400">Used</th>
                                                    <th className="py-3 px-4 text-xs font-medium text-gray-400">Avg. Citations</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {loading ? (
                                                    [...Array(3)].map((_, i) => (
                                                        <tr key={i} className="table-row">
                                                            <td colSpan="5" className="px-4 py-3"><div className="h-4 bg-gray-100 rounded w-full animate-pulse"></div></td>
                                                        </tr>
                                                    ))
                                                ) : (
                                                    mockDomains.map((item, i) => (
                                                        <tr key={item.id} className="table-row text-[13px]">
                                                            <td className="py-3 px-4 text-gray-400">{i + 1}</td>
                                                            <td className="py-3 px-4">
                                                                <div className="flex items-center gap-2 font-medium text-gray-700">
                                                                    <div className="w-5 h-5 rounded bg-orange-100 flex items-center justify-center text-orange-600 text-[10px] font-bold">
                                                                        {item.domain.charAt(0).toUpperCase()}
                                                                    </div>
                                                                    {item.domain}
                                                                </div>
                                                            </td>
                                                            <td className="py-3 px-4">
                                                                <span className={`badge ${item.type === 'UGC' ? 'badge-blue' : item.type === 'Editorial' ? 'badge-orange' : 'badge-gray'}`}>
                                                                    {item.type}
                                                                </span>
                                                            </td>
                                                            <td className="py-3 px-4 font-medium text-gray-700">{item.used}</td>
                                                            <td className="py-3 px-4 font-medium text-gray-700">{item.avg}</td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* DONUT CHART */}
                                <div className="widget flex flex-col p-5">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h3 className="font-semibold text-[15px] text-gray-900">Domains by Type</h3>
                                            <p className="text-[13px] text-gray-500 mt-0.5">Most used domains categorized</p>
                                        </div>
                                        <button className="action-button"><ArrowUpRight className="w-4 h-4" /></button>
                                    </div>

                                    <div className="flex-1 min-h-[160px] relative flex items-center justify-center">
                                        {loading ? (
                                            <div className="w-32 h-32 rounded-full border-4 border-gray-100 animate-pulse"></div>
                                        ) : (
                                            <>
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <PieChart>
                                                        <Pie
                                                            data={mockDonutData}
                                                            cx="30%"
                                                            cy="50%"
                                                            innerRadius={50}
                                                            outerRadius={65}
                                                            paddingAngle={2}
                                                            dataKey="value"
                                                            stroke="none"
                                                        >
                                                            {mockDonutData.map((entry, index) => (
                                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                                            ))}
                                                        </Pie>
                                                    </PieChart>
                                                </ResponsiveContainer>

                                                {/* Custom Legend */}
                                                <div className="absolute right-0 top-1/2 -translate-y-1/2 flex flex-col gap-2 text-[11px] font-medium text-gray-500 w-1/2 pl-4">
                                                    {mockDonutData.map((item, i) => (
                                                        <div key={i} className="flex items-center gap-2">
                                                            <span className="w-2 h-2 rounded-[3px]" style={{ backgroundColor: item.color }}></span>
                                                            {item.name}
                                                        </div>
                                                    ))}
                                                </div>
                                                {/* Center Text for Donut */}
                                                <div className="absolute left-[30%] top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                                                    <span className="text-sm font-semibold text-gray-900">12%</span>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>

                    {/* FLOATING PROMPT INPUT */}
                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-[560px] bg-white rounded-2xl floating-prompt border border-gray-200 p-2.5 flex items-center gap-3 z-50">
                        <div className="w-8 h-8 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center shrink-0 shadow-sm ml-1">
                            <span className="text-[10px]">🇺🇸</span>
                        </div>

                        <button className="px-3 py-1.5 rounded-md border border-gray-200 text-xs font-medium text-gray-400 bg-gray-50/50 hover:bg-gray-100 transition-colors shrink-0">
                            No tags
                        </button>

                        <input
                            type="text"
                            placeholder="Add your own prompts"
                            className="flex-1 bg-transparent border-none outline-none text-[15px] text-gray-700 placeholder:text-gray-300 px-2 min-w-0"
                        />

                        <button className="w-9 h-9 bg-gray-500 hover:bg-gray-600 rounded-[10px] flex items-center justify-center text-white transition-colors shrink-0 mr-0.5 shadow-sm">
                            <ArrowUp className="w-5 h-5" />
                        </button>
                    </div>

                </main>
            </div>
        </>
    );
}