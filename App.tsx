
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GroupedTrades, Trade } from './types';
import { parseMT4Report, classifyAndGroupTrades } from './services/tradeProcessor';
import { CollapsibleSection } from './components/CollapsibleSection';
import { UploadIcon } from './components/icons';

const App: React.FC = () => {
  const [rawTrades, setRawTrades] = useState<Trade[]>([]);
  const [groupedTrades, setGroupedTrades] = useState<GroupedTrades | null>(null);
  const [beTolerance, setBeTolerance] = useState<number>(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processAndSetTrades = useCallback((trades: Trade[], tolerance: number) => {
    try {
      setError(null);
      const grouped = classifyAndGroupTrades(trades, tolerance);
      if (Object.keys(grouped).length === 0) {
        setError('No se encontraron transacciones cerradas válidas en el reporte.');
        setGroupedTrades(null);
      } else {
        setGroupedTrades(grouped);
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Un error desconocido ocurrió durante el procesamiento.';
      setError(`Error procesando el archivo: ${errorMessage}`);
      setGroupedTrades(null);
    }
  }, []);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setFileName(file.name);
    setGroupedTrades(null);
    setError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      try {
        const parsedTrades = parseMT4Report(content);
        setRawTrades(parsedTrades);
        processAndSetTrades(parsedTrades, beTolerance);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Un error desconocido ocurrió.';
        setError(`Error al leer el archivo: ${errorMessage}`);
        setGroupedTrades(null);
        setRawTrades([]);
      } finally {
        setIsLoading(false);
      }
    };
    reader.onerror = () => {
      setError('No se pudo leer el archivo.');
      setIsLoading(false);
    };
    reader.readAsText(file);
    
    // Reset file input to allow re-uploading the same file
    event.target.value = '';
  }, [beTolerance, processAndSetTrades]);

  const handleToleranceChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newTolerance = parseFloat(event.target.value);
    setBeTolerance(newTolerance);
  };

  useEffect(() => {
    if (rawTrades.length > 0) {
        processAndSetTrades(rawTrades, beTolerance);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beTolerance, rawTrades]); // processAndSetTrades is memoized

  const triggerFileSelect = () => fileInputRef.current?.click();

  return (
    <div className="min-h-screen bg-gray-900 text-gray-300 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">Convertidor de Reportes MT4 a Pine Script</h1>
          <p className="mt-2 text-lg text-gray-400">Sube tu reporte HTML, configura la tolerancia y obtén tu script para TradingView.</p>
        </header>

        <main>
          <div className="bg-gray-800 shadow-lg rounded-lg p-6 mb-8 border border-gray-700">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="flex-grow w-full sm:w-auto">
                <input
                  type="file"
                  id="fileInput"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                  accept=".html, .htm"
                />
                <button
                  id="loadReportBtn"
                  onClick={triggerFileSelect}
                  className="w-full sm:w-auto flex items-center justify-center gap-x-2.5 p-3 font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-md transition-colors"
                >
                  <UploadIcon className="h-5 w-5"/>
                  Cargar Reporte
                </button>
                {fileName && <p className="text-sm text-gray-400 mt-2 text-center sm:text-left">Archivo: {fileName}</p>}
              </div>

              <div className="w-full sm:w-auto">
                <label htmlFor="beTolerance" className="block text-sm font-medium text-gray-300 mb-1">
                  Tolerancia Break Even (BE)
                </label>
                <input
                  type="number"
                  id="beTolerance"
                  value={beTolerance}
                  onChange={handleToleranceChange}
                  step="0.01"
                  className="block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>
            </div>
          </div>

          <div id="resultsSection" className="space-y-4">
            {isLoading && (
              <div className="text-center py-8">
                <p className="text-lg text-gray-400">Procesando reporte...</p>
              </div>
            )}
            {error && (
              <div className="bg-red-900/50 border border-red-700 text-red-300 p-4 rounded-lg text-center">
                <p>{error}</p>
              </div>
            )}
            {groupedTrades && Object.keys(groupedTrades).length > 0 && (
              <div className="space-y-4">
                {Object.entries(groupedTrades).map(([item, trades]) => (
                  <CollapsibleSection key={item} item={item} trades={trades} />
                ))}
              </div>
            )}
             {!isLoading && !error && !groupedTrades && (
                <div className="text-center py-12 px-6 bg-gray-800/50 border border-gray-700 rounded-lg">
                    <h2 className="text-xl font-semibold text-white">Listo para empezar</h2>
                    <p className="mt-2 text-gray-400">Carga un reporte de MT4 para ver la magia.</p>
                </div>
             )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
