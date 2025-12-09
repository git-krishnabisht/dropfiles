import { Upload, LogOut } from "lucide-react";

interface NavbarProps {
  onUploadClick: () => void;
  onSignOut: () => void;
}

export default function Navbar({ onUploadClick, onSignOut }: NavbarProps) {
  return (
    <nav className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <h1 className="text-xl font-bold text-indigo-600">
              File Dashboard
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onUploadClick}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Upload File
            </button>

            <button
              onClick={onSignOut}
              className="flex items-center gap-2 text-gray-700 hover:text-gray-900 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
