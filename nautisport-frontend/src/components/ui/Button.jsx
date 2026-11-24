const VARIANTES = {
  primary: 'bg-black text-white hover:bg-gray-800',
  secondary: 'bg-white text-black border border-gray-400 hover:bg-gray-100',
  danger: 'bg-red-600 text-white hover:bg-red-700',
};

export default function Button({
  variant = 'primary',
  loading = false,
  disabled = false,
  type = 'button',
  className = '',
  children,
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      {...props}
      className={`inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-bold text-sm uppercase tracking-wider transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${
        VARIANTES[variant] || VARIANTES.primary
      } ${className}`}
    >
      {loading && (
        <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {loading ? 'Procesando...' : children}
    </button>
  );
}
