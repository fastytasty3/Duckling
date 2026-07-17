import { Route, Switch, Router as WouterRouter } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { FlashProvider } from '@/components/flash-provider';
import { Layout } from '@/components/layout';

import NotFound from '@/pages/not-found';
import Home from '@/pages/home';
import History from '@/pages/history';
import Reports from '@/pages/reports';
import Products from '@/pages/products';
import Operators from '@/pages/operators';
import Settings from '@/pages/settings';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
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
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <FlashProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
          <Toaster />
        </FlashProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
