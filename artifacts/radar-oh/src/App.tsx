import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Switch, Route, useLocation, Router as WouterRouter, Redirect as WouterRedirect } from 'wouter';
import { Radar, ArrowRight, ShieldCheck, Zap, LineChart } from "lucide-react";
// @ts-ignore - legacy jsx file
import LegacyApp from "./legacy/App.jsx";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(15 77% 52%)", // --signal
    colorForeground: "hsl(207 35% 15%)", // --ink
    colorMutedForeground: "hsl(207 13% 42%)", // --ink-muted
    colorDanger: "hsl(7 65% 47%)", // --red
    colorBackground: "hsl(0 0% 100%)", // --surface
    colorInput: "hsl(0 0% 100%)",
    colorInputForeground: "hsl(207 35% 15%)",
    colorNeutral: "hsl(207 16% 86%)", // --line
    fontFamily: "DM Sans, sans-serif",
    borderRadius: "8px",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[hsl(var(--surface))] rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl border border-[hsl(var(--line))]",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[hsl(var(--ink))] font-display font-bold text-2xl tracking-tight font-['Syne',sans-serif]",
    headerSubtitle: "text-[hsl(var(--ink-muted))] text-sm",
    socialButtonsBlockButtonText: "text-[hsl(var(--ink))] font-semibold",
    formFieldLabel: "text-[hsl(var(--ink-muted))] font-['Space_Mono',monospace] text-[10px] tracking-wider uppercase mb-1.5",
    footerActionLink: "text-[hsl(var(--signal))] font-bold hover:text-[hsl(15,77%,45%)]",
    footerActionText: "text-[hsl(var(--ink-muted))] text-sm",
    dividerText: "text-[hsl(var(--ink-soft))] text-xs font-medium bg-[hsl(var(--surface))] px-2",
    identityPreviewEditButton: "text-[hsl(var(--signal))] hover:bg-[hsl(var(--signal-soft))]",
    formFieldSuccessText: "text-[hsl(var(--teal))] text-xs",
    alertText: "text-[hsl(var(--red))] text-sm font-medium",

    logoBox: "h-12 flex justify-center mb-6",
    logoImage: "h-12 w-auto",
    socialButtonsBlockButton: "border border-[hsl(var(--line))] bg-[hsl(var(--surface))] hover:bg-[hsl(var(--paper))] rounded-lg transition-colors",
    formButtonPrimary: "bg-[hsl(var(--signal))] hover:bg-[hsl(15,77%,45%)] text-white font-bold rounded-lg py-2.5 transition-transform hover:-translate-y-[1px] active:translate-y-0",
    formFieldInput: "bg-[hsl(var(--surface))] border-[hsl(var(--line-strong))] rounded-lg px-3 py-2 text-[hsl(var(--ink))] placeholder:text-[hsl(var(--ink-soft))] focus:border-[hsl(var(--signal))] focus:ring-1 focus:ring-[hsl(var(--signal))]",
    footerAction: "mt-4 pt-4 border-t border-[hsl(var(--line))] flex justify-center gap-1",
    dividerLine: "bg-[hsl(var(--line))]",
    alert: "bg-[hsl(7,65%,97%)] border border-[hsl(7,65%,82%)] rounded-lg p-3",
    otpCodeFieldInput: "border-[hsl(var(--line-strong))] text-[hsl(var(--ink))] font-['Space_Mono',monospace] text-lg rounded-lg focus:border-[hsl(var(--signal))]",
    formFieldRow: "mb-4",
    main: "w-full",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[hsl(var(--paper))] px-4 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[hsl(var(--signal))] opacity-[0.03] blur-3xl rounded-full translate-x-1/3 -translate-y-1/3" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-[hsl(var(--navy))] opacity-[0.03] blur-3xl rounded-full -translate-x-1/3 translate-y-1/3" />

      <div className="relative z-10 w-full max-w-[440px]">
        <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
      </div>
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[hsl(var(--paper))] px-4 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[hsl(var(--signal))] opacity-[0.03] blur-3xl rounded-full translate-x-1/3 -translate-y-1/3" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-[hsl(var(--navy))] opacity-[0.03] blur-3xl rounded-full -translate-x-1/3 translate-y-1/3" />

      <div className="relative z-10 w-full max-w-[440px]">
        <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
      </div>
    </div>
  );
}

function LandingPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-[100dvh] bg-[hsl(var(--paper))] text-[hsl(var(--ink))] flex flex-col font-['DM_Sans',sans-serif]">
      <header className="px-6 py-6 md:px-12 md:py-8 flex justify-between items-center border-b border-[hsl(var(--line))] bg-[hsl(var(--paper))] relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full border border-[hsl(var(--signal))] flex items-center justify-center relative bg-[hsl(var(--surface))]">
            <div className="absolute inset-0 bg-[hsl(var(--signal))] opacity-10 rounded-full" />
            <Radar className="text-[hsl(var(--signal))]" size={20} strokeWidth={2} />
          </div>
          <div>
            <h1 className="font-['Syne',sans-serif] text-xl font-bold tracking-tight text-[hsl(var(--ink))] m-0 leading-none">RadarOH</h1>
            <div className="font-['Space_Mono',monospace] text-[10px] tracking-widest text-[hsl(var(--ink-muted))] uppercase mt-1">OH Casas</div>
          </div>
        </div>
        <button
          onClick={() => setLocation('/sign-in')}
          className="bg-[hsl(var(--signal))] hover:bg-[hsl(15,77%,45%)] text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-transform hover:-translate-y-[1px] active:translate-y-0"
        >
          Acceder
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center relative px-6 py-20 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[radial-gradient(circle_at_center,hsl(var(--signal)/0.04)_0,transparent_60%)] pointer-events-none" />

        <div className="max-w-3xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 bg-[hsl(var(--navy))] text-[hsl(42,33%,96%)] px-3 py-1.5 rounded-full text-xs font-medium mb-8">
            <span className="w-1.5 h-1.5 bg-[hsl(var(--signal))] rounded-full animate-pulse" />
            Plataforma privada de inteligencia competitiva
          </div>

          <h2 className="font-['Syne',sans-serif] text-5xl md:text-7xl font-bold text-[hsl(var(--ink))] tracking-tight mb-8 leading-[1.05]">
            La señal <span className="text-[hsl(var(--ink-muted))]">antes que</span> el ruido.
          </h2>

          <p className="text-lg md:text-xl text-[hsl(var(--ink-muted))] max-w-2xl mx-auto mb-12 leading-relaxed">
            Monitorización centralizada, análisis de competidores y alertas de mercado impulsadas por IA. Espacio de trabajo exclusivo para operaciones de OH Casas.
          </p>

          <button
            onClick={() => setLocation('/sign-in')}
            className="inline-flex items-center gap-2 bg-[hsl(var(--ink))] hover:bg-[hsl(207,35%,25%)] text-white text-base font-bold px-8 py-4 rounded-xl transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-[hsl(var(--shadow))/0.1] active:translate-y-0"
          >
            Iniciar sesión <ArrowRight size={18} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl mt-24 relative z-10">
          <div className="bg-[hsl(var(--surface))] p-6 rounded-2xl border border-[hsl(var(--line))] shadow-lg shadow-[hsl(var(--shadow))/0.02]">
            <div className="w-12 h-12 bg-[hsl(var(--signal-soft))] text-[hsl(var(--signal))] rounded-xl flex items-center justify-center mb-5">
              <ShieldCheck size={24} />
            </div>
            <h3 className="font-['Syne',sans-serif] text-lg font-bold mb-2 text-[hsl(var(--ink))]">Acceso Restringido</h3>
            <p className="text-sm text-[hsl(var(--ink-muted))] leading-relaxed">Sistema protegido para el análisis confidencial del mercado inmobiliario y operaciones estratégicas.</p>
          </div>
          <div className="bg-[hsl(var(--surface))] p-6 rounded-2xl border border-[hsl(var(--line))] shadow-lg shadow-[hsl(var(--shadow))/0.02]">
            <div className="w-12 h-12 bg-[hsl(var(--teal-soft))] text-[hsl(var(--teal))] rounded-xl flex items-center justify-center mb-5">
              <LineChart size={24} />
            </div>
            <h3 className="font-['Syne',sans-serif] text-lg font-bold mb-2 text-[hsl(var(--ink))]">Monitorización 360°</h3>
            <p className="text-sm text-[hsl(var(--ink-muted))] leading-relaxed">Seguimiento continuo de competidores, fuentes de datos estructurados y evolución de posicionamiento.</p>
          </div>
          <div className="bg-[hsl(var(--surface))] p-6 rounded-2xl border border-[hsl(var(--line))] shadow-lg shadow-[hsl(var(--shadow))/0.02]">
            <div className="w-12 h-12 bg-[hsl(var(--amber-soft))] text-[hsl(var(--amber))] rounded-xl flex items-center justify-center mb-5">
              <Zap size={24} />
            </div>
            <h3 className="font-['Syne',sans-serif] text-lg font-bold mb-2 text-[hsl(var(--ink))]">Insights IA</h3>
            <p className="text-sm text-[hsl(var(--ink-muted))] leading-relaxed">Procesamiento automático de alertas y síntesis ejecutiva para la toma rápida de decisiones.</p>
          </div>
        </div>
      </main>

      <footer className="py-8 text-center text-[hsl(var(--ink-soft))] text-xs font-['Space_Mono',monospace] border-t border-[hsl(var(--line))] bg-[hsl(var(--paper))]">
        &copy; {new Date().getFullYear()} OH Casas Signal Desk. Uso interno exclusivo.
      </footer>
    </div>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <LegacyApp />
      </Show>
      <Show when="signed-out">
        <LandingPage />
      </Show>
    </>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Acceso al sistema",
            subtitle: "Inicia sesión en RadarOH",
          },
          emailLink: {
            title: "Verifica tu correo",
            subtitle: "Hemos enviado un enlace a tu correo",
          },
          emailCode: {
            title: "Introduce el código",
            subtitle: "Enviado a tu correo",
          },
        },
        signUp: {
          start: {
            title: "Solicitar acceso",
            subtitle: "Crea una cuenta en el sistema",
          },
        }
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <Switch>
        <Route path="/" component={HomeRedirect} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/*">
          <WouterRedirect to="/" />
        </Route>
      </Switch>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
