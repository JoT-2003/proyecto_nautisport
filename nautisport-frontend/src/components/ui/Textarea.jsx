export default function Textarea({ label, name, error, required, className = '', ...props }) {
  const id = props.id || name;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="block text-xs font-bold uppercase text-gray-800 mb-1">
          {label} {required && <span className="text-red-600">*</span>}
        </label>
      )}
      <textarea
        id={id}
        name={name}
        {...props}
        className={`w-full border border-gray-400 bg-white text-black p-2 rounded placeholder-gray-400 font-medium focus:outline-none focus:ring-2 focus:ring-black ${
          error ? 'border-red-500' : ''
        }`}
      />
      {error && <p className="mt-1 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}
