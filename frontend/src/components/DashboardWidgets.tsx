import React from 'react';
import { 
    ResponsiveContainer, 
    BarChart, 
    Bar, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip as RechartsTooltip, 
    Legend, 
    FunnelChart, 
    Funnel, 
    LabelList,
    AreaChart,
    Area,
    PieChart,
    Pie,
    Cell
} from 'recharts';
import { 
    BarChart3, 
    TrendingUp, 
    TrendingDown,
    Trophy, 
    DollarSign, 
    Activity, 
    Share2, 
    ArrowRight,
    MoreHorizontal,
    Globe,
    Database,
    Server,
    HardDrive,
    CheckCircle2,
    XCircle,
    AlertCircle
} from 'lucide-react';
import { ExportButton } from './analytics/ExportButton';


// --- STYLED COMPONENTS (Professional / Fuse Finance Style) ---

const CardContainer: React.FC<{children: React.ReactNode, className?: string, onClick?: () => void}> = ({children, className = "", onClick}) => (
    <div 
        onClick={onClick}
        className={`bg-white dark:bg-reply-panel-dark border border-slate-200 dark:border-reply-border-dark rounded-xl shadow-sm hover:shadow-md transition-all duration-200 flex flex-col ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
        {children}
    </div>
);

const WidgetHeader: React.FC<{title: string, icon?: React.ReactNode, action?: React.ReactNode}> = ({title, icon, action}) => (
    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-reply-border-dark">
        <div className="flex items-center gap-3">
            {icon && <span className="text-slate-400 dark:text-slate-500">{icon}</span>}
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm tracking-wide uppercase">{title}</h3>
        </div>
        {action || <button className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><MoreHorizontal className="w-4 h-4" /></button>}
    </div>
);

// --- WIDGETS ---

export const StatCard: React.FC<{title: string, value: string | number, icon: React.ReactNode, color?: string, bg?: string, trend?:string, trendColor?:string, onClick?: () => void, isLoading?: boolean}> = ({title, value, icon, color, bg, trend, trendColor, onClick, isLoading}) => (
  <CardContainer onClick={onClick} className="h-full relative overflow-hidden group">
     <div className="p-6">
         <div className="flex justify-between items-start mb-4">
             <div className={`p-3 rounded-lg ${bg || 'bg-slate-50 dark:bg-slate-800'} ${color || 'text-slate-600 dark:text-slate-300'}`}>
                {icon}
             </div>
             {(trend || isLoading) && (
                  isLoading ? (
                       <div className="h-4 w-12 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                  ) : (
                     <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${trendColor?.includes('green') ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400'}`}>
                         {trendColor?.includes('green') ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                         {trend}
                     </div>
                  )
             )}
         </div>
         
         <div>
             <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{title}</p>
             {isLoading ? (
                <div className="h-8 w-24 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
             ) : (
                <h4 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">{value}</h4>
             )}
         </div>
     </div>
  </CardContainer>
);

export const ActiveLoadChart: React.FC<{ data?: any[] }> = ({ data }) => {
    const chartData = data || [];

    return (
        <CardContainer className="h-full">
            <WidgetHeader 
                title="Carga de Trabajo" 
                icon={<BarChart3 className="w-4 h-4" />} 
            />
            <div className="p-6 flex-1 min-h-[250px]">
                {chartData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                        <BarChart3 className="w-8 h-8 mb-2 opacity-50" />
                        <p className="text-sm font-medium">Sin datos de carga</p>
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis 
                                dataKey="name" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fill: '#64748b', fontSize: 11 }} 
                                dy={10}
                            />
                            <YAxis 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fill: '#64748b', fontSize: 11 }} 
                            />
                            <RechartsTooltip 
                                cursor={{ fill: '#f1f5f9' }}
                                contentStyle={{ backgroundColor: '#fff', borderColor: '#e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', color: '#1e293b' }}
                            />
                            <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
                            <Bar 
                                dataKey="pending" 
                                name="Pendiente" 
                                stackId="a" 
                                fill="#ef4444" 
                                radius={[0, 0, 4, 4]} 
                                barSize={20}
                            />
                            <Bar 
                                dataKey="inProgress" 
                                name="En Progreso" 
                                stackId="a" 
                                fill="#f59e0b" 
                                radius={[4, 4, 0, 0]} 
                                barSize={20}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>
        </CardContainer>
    );
};

export const SalesFunnelWidget: React.FC<{ data?: any[] }> = ({ data }) => {
    const funnelData = data || [];

    return (
        <CardContainer className="h-full">
            <WidgetHeader title="Pipeline de Ventas" icon={<DollarSign className="w-4 h-4" />} />
            <div className="p-6 flex-1 min-h-[250px]">
                {funnelData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                        <DollarSign className="w-8 h-8 mb-2 opacity-50" />
                        <p className="text-sm font-medium">Pipeline vacío</p>
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <FunnelChart>
                            <RechartsTooltip 
                                 contentStyle={{ backgroundColor: '#fff', borderColor: '#e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', color: '#1e293b' }}
                            />
                            <Funnel
                                dataKey="value"
                                data={funnelData}
                                isAnimationActive
                            >
                                <LabelList position="right" fill="#64748b" stroke="none" dataKey="name" fontSize={11} />
                                <LabelList position="inside" fill="#fff" stroke="none" dataKey="value" fontSize={11} fontWeight="bold" />
                            </Funnel>
                        </FunnelChart>
                    </ResponsiveContainer>
                )}
            </div>
        </CardContainer>
    );
};

export const AgentLeaderboardWidget: React.FC<{ agents?: any[] }> = ({ agents = [] }) => {
    return (
        <CardContainer className="h-full">
            <WidgetHeader 
                title="Top Agentes" 
                icon={<Trophy className="w-4 h-4" />}
                action={<ExportButton type="agents" label="Exportar" />}
            />
            <div className="p-0 flex-1 overflow-y-auto custom-scrollbar">
                {agents.length === 0 ? (
                    <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
                        No hay datos.
                    </div>
                ) : (
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-500 uppercase font-semibold">
                            <tr>
                                <th className="px-6 py-3">Agente</th>
                                <th className="px-6 py-3 text-right">Score</th>
                                <th className="px-6 py-3 text-right">Ventas</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {agents.map((agent, i) => (
                                <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                    <td className="px-6 py-4 flex items-center gap-3">
                                        <div className="relative">
                                            <img src={agent.avatar || `https://ui-avatars.com/api/?name=${agent.name}&background=random`} className="w-8 h-8 rounded-full" alt={agent.name} />
                                            {i === 0 && <span className="absolute -top-1 -right-1 text-yellow-500 drop-shadow-sm">👑</span>}
                                        </div>
                                        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{agent.name}</span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                                            {agent.score}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right text-sm text-slate-600 dark:text-slate-400 font-mono">
                                        {agent.sales}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </CardContainer>
        );
    };

export const ChannelDistributionWidget: React.FC<{ channels?: any[] }> = ({ channels = [] }) => {
    return (
    <CardContainer className="h-full">
         <WidgetHeader title="Canales" icon={<Share2 className="w-4 h-4" />} />
         <div className="p-6 flex-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
             {channels.length === 0 ? (
                 <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                    Sin datos.
                 </div>
             ) : (
                 channels.map((stat, i) => (
                     <div key={i} className="group">
                         <div className="flex justify-between items-center mb-1">
                             <span className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                <i className={`${stat.iconClass} text-slate-400`}></i> 
                                {stat.name}
                             </span>
                             <span className="text-xs font-bold text-slate-500">{stat.percentage}%</span>
                         </div>
                         <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                             <div 
                                className={`h-full rounded-full transition-all duration-500 ${stat.color?.replace('text-', 'bg-') || 'bg-blue-500'}`} 
                                style={{width: `${stat.percentage}%`}}
                             />
                         </div>
                     </div>
                 ))
             )}
         </div>
    </CardContainer>
    );
};

export const ActionButton: React.FC<{onClick: () => void, icon: React.ReactNode, text: string}> = ({ onClick, icon, text }) => (
    <button onClick={onClick} className="w-full flex items-center gap-3 p-4 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl border border-slate-200 dark:border-reply-border-dark shadow-sm hover:shadow-md transition-all group">
        <span className="text-slate-400 group-hover:text-blue-600 dark:text-slate-500 dark:group-hover:text-blue-400 transition-colors">
            {icon}
        </span>
        <span className="font-semibold text-sm text-slate-700 dark:text-slate-200">{text}</span>
        <ArrowRight className="ml-auto w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100" />
    </button>
);

export const ActivityItem: React.FC<{icon: React.ReactNode, text: string, time: string}> = ({ icon, text, time }) => (
    <li className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
        <div className="mt-0.5 p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
            {icon}
        </div>
        <div className="flex-1">
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-snug">{text}</p>
            <p className="text-xs text-slate-400 mt-1">{time}</p>
        </div>
    </li>
);

interface ServiceStatus {
    status: string;
    latency: number;
}

interface SystemStatusProps {
    data?: {
        api: ServiceStatus;
        database: ServiceStatus;
        queues: ServiceStatus;
        storage: ServiceStatus;
    };
}

const StatusIndicator: React.FC<{status: string, latency: number}> = ({status, latency}) => {
    // Treat 'Inactivo (Memoria)' as operational for dev environments. 
    // Match 'Operacional', 'Activo', 'Conectado', etc.
    const isUp = /Operacional|Activo|Conectado|Memoria/i.test(status);
    const isSlow = latency > 200 && isUp;
    
    let colorClass = 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20';
    let icon = <CheckCircle2 className="w-4 h-4" />;
    
    if (!isUp) {
        if (status === 'Cargando...') {
            colorClass = 'text-slate-500 bg-slate-50 dark:bg-slate-800';
            icon = <Activity className="w-4 h-4 animate-spin" />;
        } else {
            colorClass = 'text-red-500 bg-red-50 dark:bg-red-900/20';
            icon = <XCircle className="w-4 h-4" />;
        }
    } else if (isSlow) {
        colorClass = 'text-amber-500 bg-amber-50 dark:bg-amber-900/20';
        icon = <AlertCircle className="w-4 h-4" />;
    }

    return (
        <div className="flex items-center gap-3">
             <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${colorClass}`}>
                {icon}
                <span>{status}</span>
             </div>
             {isUp && (
                 <span className={`text-xs font-mono font-medium ${latency > 200 ? 'text-amber-500' : 'text-slate-400'}`}>
                    {latency > 0 ? `${latency}ms` : '<1ms'}
                 </span>
             )}
        </div>
    );
};

export const SystemStatusModule: React.FC<SystemStatusProps> = ({ data }) => {
    const services = [
        { key: 'api', name: 'API Gateway', icon: <Globe className="w-4 h-4" />, status: data?.api?.status || 'Cargando...', latency: data?.api?.latency },
        { key: 'db', name: 'Base de Datos', icon: <Database className="w-4 h-4" />, status: data?.database?.status || 'Cargando...', latency: data?.database?.latency },
        { key: 'queue', name: 'Sistema de Colas', icon: <Activity className="w-4 h-4" />, status: data?.queues?.status || 'Cargando...', latency: data?.queues?.latency },
        { key: 'storage', name: 'Almacenamiento', icon: <HardDrive className="w-4 h-4" />, status: data?.storage?.status || 'Cargando...', latency: data?.storage?.latency },
    ];

    return (
        <CardContainer className="h-full">
            <WidgetHeader 
                title="Estado del Sistema" 
                icon={<Activity className="w-4 h-4" />} 
                action={<div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"/><span className="text-xs text-emerald-500 font-medium uppercase">En Vivo</span></div>}
            /> 
            <div className="p-0">
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {services.map((service, i) => (
                        <div key={i} className="flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                                    {service.icon}
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{service.name}</p>
                                    <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Servicio</p>
                                </div>
                            </div>
                            <StatusIndicator status={service.status} latency={service.latency || 0} />
                        </div>
                    ))}
                </div>
            </div>
            {/* Footer metrics */}
            <div className="bg-slate-50 dark:bg-slate-800/50 px-6 py-3 border-t border-slate-100 dark:border-reply-border-dark text-xs text-slate-500 flex justify-between">
               <span>Disponibilidad (30d): <strong className="text-slate-700 dark:text-slate-300">99.99%</strong></span>
               <span>Últ. Chequeo: <strong className="text-slate-700 dark:text-slate-300">Ahora mismo</strong></span>
            </div>
        </CardContainer>
    );
};

export const RecentActivityModule: React.FC<{activities?: any[]}> = ({activities = []}) => (
    <CardContainer className="h-full">
        <WidgetHeader title="Actividad Reciente" icon={<Activity className="w-4 h-4" />} />
        <div className="p-0 flex-1 overflow-y-auto custom-scrollbar">
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {activities.length === 0 ? (
                    <p className="text-slate-400 text-sm text-center py-6">No hay actividad reciente.</p>
                ) : (
                    activities.map((act, i) => (
                        <ActivityItem key={i} icon={<Activity className="w-3.5 h-3.5" />} text={act.text || 'Actividad'} time={act.time || 'Reciente'} />
                    ))
                )}
            </ul>
        </div>
    </CardContainer>
);

export const MrrTrendModule: React.FC<{ data: any[] }> = ({ data = [] }) => (
    <CardContainer className="h-full">
        <WidgetHeader title="Tendencia MRR" icon={<TrendingUp className="w-4 h-4" />} />
        <div className="p-6 flex-1 min-h-[250px]">
             {data.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                    <TrendingUp className="w-8 h-8 mb-2 opacity-50" />
                    <p className="text-sm font-medium">Sin datos históricos</p>
                </div>
             ) : (
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis 
                            dataKey="name" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#64748b', fontSize: 11 }} 
                            dy={10}
                        />
                        <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#64748b', fontSize: 11 }}
                            tickFormatter={(value) => `$${value}`}
                        />
                        <RechartsTooltip 
                             contentStyle={{ backgroundColor: '#fff', borderColor: '#e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', color: '#1e293b' }}
                             formatter={(value) => [`$${value}`, 'Ingresos']}
                        />
                        <Area 
                            type="monotone" 
                            dataKey="revenue" 
                            stroke="#10b981" 
                            fillOpacity={1} 
                            fill="url(#colorRevenue)" 
                            strokeWidth={2}
                        />
                    </AreaChart>
                </ResponsiveContainer>
             )}
        </div>
    </CardContainer>
);

export const PlanDistributionModule: React.FC<{ data: any[] }> = ({ data = [] }) => {
    // Colors for the pie chart
    const COLORS = ['#6366f1', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'];

    return (
        <CardContainer className="h-full">
             <WidgetHeader title="Distribución de Planes" icon={<BarChart3 className="w-4 h-4" />} />
             <div className="p-6 flex-1 min-h-[250px] flex items-center justify-center">
                 {data.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                        <BarChart3 className="w-8 h-8 mb-2 opacity-50" />
                        <p className="text-sm font-medium">Sin datos de planes</p>
                    </div>
                 ) : (
                    <div className="w-full h-full relative">
                        <ResponsiveContainer width="100%" height={250}>
                            <PieChart>
                                <Pie
                                    data={data}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {data.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <RechartsTooltip 
                                    formatter={(value, name) => [value, name]}
                                    contentStyle={{ backgroundColor: '#fff', borderColor: '#e2e8f0', borderRadius: '8px', color: '#1e293b' }}
                                />
                                <Legend 
                                    layout="vertical" 
                                    verticalAlign="middle" 
                                    align="right"
                                    iconType="circle"
                                />
                            </PieChart>
                        </ResponsiveContainer>
                        {/* Center Metric */}
                        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                            <p className="text-sm text-slate-400">Total</p>
                            <p className="text-xl font-bold text-slate-800 dark:text-white">
                                {data.reduce((acc, curr) => acc + curr.value, 0)}
                            </p>
                        </div>
                    </div>
                 )}
             </div>
        </CardContainer>
    );
};

// PieChart import removed to avoid conflict with Recharts

export const TopTenantsModule: React.FC<any> = (props) => (
    <CardContainer>
         <WidgetHeader title="Top Clientes" icon={<Globe className="w-4 h-4" />} />
         <div className="p-6 text-center text-slate-400 text-sm">Disponibilidad próximamente</div>
    </CardContainer>
);

export { CardContainer, WidgetHeader };

