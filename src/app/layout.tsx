import './globals.css';

export const metadata = { title: 'UDL Support', description: 'Mesa de ayuda Universidad de Londres' };
// Ancho del dispositivo y escala 1: evita que el celular "aleje" la página y todo se vea diminuto.
export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#15131d' };

// Aplica el tema guardado (claro u oscuro) antes de pintar la página; por defecto, oscuro.
const THEME_SCRIPT = "try{var t=localStorage.getItem('udl-theme');document.documentElement.dataset.theme=t==='light'?'light':'dark';if(t==='light'){var m=document.querySelector('meta[name=theme-color]');if(m)m.setAttribute('content','#f7f5fb')}}catch(e){document.documentElement.dataset.theme='dark'}";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: el script de abajo pone data-theme antes de que React hidrate.
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        {/* Fondo aurora: los paneles de vidrio necesitan color detrás para que el desenfoque se aprecie. */}
        <div className="aurora" aria-hidden="true"><i /><i /><i /><i /></div>
        {children}
      </body>
    </html>
  );
}
