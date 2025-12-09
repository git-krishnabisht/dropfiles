interface StatusMessageProps {
  message: string;
  type: "success" | "error" | "info";
}

export default function StatusMessage({ message, type }: StatusMessageProps) {
  const styles = {
    success: "bg-green-50 text-green-800 border-green-200",
    error: "bg-red-50 text-red-800 border-red-200",
    info: "bg-blue-50 text-blue-800 border-blue-200",
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
      <div className={`p-4 rounded-lg border ${styles[type]}`}>{message}</div>
    </div>
  );
}
