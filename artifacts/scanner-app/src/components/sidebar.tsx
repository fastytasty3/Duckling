import { Link, useLocation } from "wouter";
import { 
  Timer, 
  History, 
  BarChart2, 
  Package, 
  Users, 
  Settings,
  ScanLine
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Главный экран", icon: Timer },
  { href: "/history", label: "История операций", icon: History },
  { href: "/reports", label: "Отчёт", icon: BarChart2 },
  { href: "/products", label: "Справочник товаров", icon: Package },
  { href: "/operators", label: "Операторы и смены", icon: Users },
  { href: "/settings", label: "Настройки", icon: Settings },
];

export function Sidebar() {
  const [location] = useLocation();

  return (
    <aside className="w-64 bg-sidebar border-r border-sidebar-border h-[100dvh] flex flex-col fixed left-0 top-0">
      <div className="h-16 flex items-center px-6 border-b border-sidebar-border shrink-0">
        <div className="flex items-center gap-3 text-sidebar-primary">
          <ScanLine className="h-6 w-6" />
          <span className="font-bold text-lg text-sidebar-foreground tracking-tight uppercase">Счётчик</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="block">
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors duration-200",
                  isActive 
                    ? "bg-sidebar-primary text-sidebar-primary-foreground" 
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon className={cn("h-5 w-5", isActive ? "opacity-100" : "opacity-70")} />
                {item.label}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border text-xs text-muted-foreground text-center shrink-0">
        Терминал v1.0.0
      </div>
    </aside>
  );
}
