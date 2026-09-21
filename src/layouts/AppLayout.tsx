import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, FileText, BookTemplate, FolderOpen, CreditCard,
  Bell, Clock, Settings, LogOut, ChevronRight, Scale, Menu, X, Search,
  ChevronDown
} from 'lucide-react';

const navGroups = [
  {
    label: 'Principal',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/clientes', icon: Users, label: 'Clientes' },
      { to: '/contratos', icon: FileText, label: 'Contratos' },
      { to: '/modelos', icon: BookTemplate, label: 'Modelos' },
      { to: '/documentos', icon: FolderOpen, label: 'Documentos' },
      { to: '/pagamentos', icon: CreditCard, label: 'Pagamentos' },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { to: '/notificacoes', icon: Bell, label: 'Notificações', badge: 3 },
      { to: '/historico', icon: Clock, label: 'Histórico' },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { to: '/configuracoes', icon: Settings, label: 'Configurações' },
    ],
  },
];

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = () => navigate('/login');

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--color-background)' }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-30 flex flex-col w-60 bg-white border-r border-slate-200 transition-transform duration-200 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ borderColor: 'var(--color-border)' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--color-primary)' }}>
            <Scale size={16} className="text-white" />
          </div>
          <div>
            <span className="text-sm font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-foreground)' }}>
              LexContract
            </span>
            <span className="block text-xs" style={{ color: 'var(--color-muted-foreground)' }}>Gestão Jurídica</span>
          </div>
          <button className="ml-auto lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-3">
          {navGroups.map((group) => (
            <div key={group.label} className="mb-4">
              <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--color-muted-foreground)' }}>
                {group.label}
              </div>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-medium mb-0.5 group transition-colors ${
                      isActive
                        ? 'text-white'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`
                  }
                  style={({ isActive }) => isActive ? { backgroundColor: 'var(--color-primary)' } : {}}
                >
                  <item.icon size={16} className="flex-shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <span className="text-xs rounded-full px-1.5 py-0.5 font-semibold" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* User profile */}
        <div className="border-t p-3" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-2.5 p-2 rounded-md hover:bg-slate-50 cursor-pointer group">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: 'var(--color-primary)' }}>
              MR
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate text-slate-900">Muryllo Rocha</div>
              <div className="text-xs truncate" style={{ color: 'var(--color-muted-foreground)' }}>Advogado · OAB/SP 123.456</div>
            </div>
            <ChevronDown size={14} className="text-slate-400 flex-shrink-0" />
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-medium mt-1 text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <LogOut size={15} />
            Sair
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="flex items-center gap-3 px-5 py-3 bg-white border-b flex-shrink-0" style={{ borderColor: 'var(--color-border)' }}>
          <button className="lg:hidden p-1.5 rounded-md hover:bg-slate-100" onClick={() => setSidebarOpen(true)}>
            <Menu size={18} className="text-slate-600" />
          </button>
          <div className="flex-1 flex items-center gap-2 max-w-md">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                placeholder="Buscar clientes, contratos..."
                className="w-full pl-9 pr-4 py-1.5 text-sm rounded-md border bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 placeholder-slate-400"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-foreground)' }}
              />
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <NavLink to="/notificacoes" className="relative p-2 rounded-md hover:bg-slate-100 text-slate-500">
              <Bell size={18} />
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
            </NavLink>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: 'var(--color-primary)' }}>
              MR
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
