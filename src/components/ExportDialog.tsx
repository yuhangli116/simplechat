import React from 'react';
import { X, FileText, Image, FileJson, FileCode, CheckCircle2 } from 'lucide-react';

interface ExportOption {
  value: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (format: string) => void;
  options: ExportOption[];
  title: string;
}

const ExportDialog: React.FC<ExportDialogProps> = ({ isOpen, onClose, onExport, options, title }) => {
  const [selectedFormat, setSelectedFormat] = React.useState<string>(options[0]?.value || '');

  React.useEffect(() => {
    if (isOpen && options.length > 0) {
      setSelectedFormat(options[0].value);
    }
  }, [isOpen, options]);

  if (!isOpen) return null;

  const handleExport = () => {
    onExport(selectedFormat);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-3">
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => setSelectedFormat(option.value)}
              className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
                selectedFormat === option.value
                  ? 'border-purple-500 bg-purple-50'
                  : 'border-gray-200 hover:border-purple-300 hover:bg-gray-50'
              }`}
            >
              <div className={`p-3 rounded-lg ${
                selectedFormat === option.value ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-600'
              }`}>
                {option.icon}
              </div>
              <div className="flex-1 text-left">
                <div className="font-semibold text-gray-900">{option.label}</div>
                <div className="text-sm text-gray-500">{option.description}</div>
              </div>
              {selectedFormat === option.value && (
                <CheckCircle2 className="w-6 h-6 text-purple-500" />
              )}
            </button>
          ))}
        </div>

        <div className="p-6 border-t border-gray-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleExport}
            className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-medium hover:from-purple-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg"
          >
            导出
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportDialog;
