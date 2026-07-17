import { Route, Switch, Router as WouterRouter, Redirect } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { FlashProvider } from '@/components/flash-provider';
import { AuthProvider, useAuth } from '@/contexts/auth-context';
import { Layout } from '@/components/layout';

import NotFound from '@/pages/not-found';
import Home from '@/pages/home';
import History from '@/pages/history';
import Reports from '@/pages/reports';
import Products from '@/pages/products';
import Operators from '@/pages/operators';
import Settings from '@/pages/settings';
import LoginPage from '@/pages/login';
import SupervisorPanel from '@/pages/supervisor/index';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Protect supervisor routes — redirect to login if not authenticated
function ProtectedSupervisor() {
  const { supervisor, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen bg-zinc-950" />;
  if (!supervisor) return <Redirect to="/supervisor/login" />;
  return <SupervisorPanel />;
}

function Router() {
  return (
    <Switch>
      {/* Supervisor routes — outside the operator Layout */}
      <Route path="/supervisor/login" component={LoginPage} />
      <Route path="/supervisor" component={ProtectedSupervisor} />

      {/* Operator routes — wrapped in the existing Layout */}
      <Route>
        <Layout>
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/history" component={History} />
            <Route path="/reports" component={Reports} />
            <Route path="/products" component={Products} />
            <Route path="/operators" component={Operators} />
            <Route path="/settings" component={Settings} />
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <FlashProvider>
          <AuthProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
              <Router />
            </WouterRouter>
            <Toaster />
          </AuthProvider>
        </FlashProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
