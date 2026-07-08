export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Middleware handles auth redirects now
  return (
    <div 
      className="min-h-screen flex items-center justify-center relative"
      style={{
        backgroundImage: 'url(/images/wtc.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* Overlay navy institucional de Grupo Velutini sobre la fotografía */}
      <div className="absolute inset-0 bg-gradient-to-br from-brand-950/85 via-brand-900/70 to-brand-800/50"></div>

      {/* Content */}
      <div className="w-full max-w-md px-4 relative z-10">
        {children}
      </div>
    </div>
  );
}
