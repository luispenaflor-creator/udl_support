import './globals.css';

export const metadata = { title: 'UDL Support', description: 'Mesa de ayuda Universidad de Londres' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        {/* Fondo aurora: los paneles de vidrio necesitan color detrás para que el desenfoque se aprecie. */}
        <div className="aurora" aria-hidden="true"><i /><i /><i /><i /></div>
        {children}
      </body>
    </html>
  );
}
