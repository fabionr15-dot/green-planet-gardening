import { useState, useRef } from 'react';

export default function PlantAI() {
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const handleFile = (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be smaller than 5MB');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Please upload a JPG, PNG, or WebP image');
      return;
    }
    setError(null);
    setResult(null);
    setImage(file);
    setPreview(URL.createObjectURL(file));
  };

  const identify = async () => {
    if (!image) return;
    setLoading(true);
    setError(null);

    try {
      const reader = new FileReader();
      const base64 = await new Promise((resolve) => {
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(image);
      });

      const res = await fetch('/.netlify/functions/identify-plant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64 }),
      });

      if (!res.ok) throw new Error('Identification failed');
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setError('Could not identify the plant. Please try again with a clearer photo.');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setImage(null);
    setPreview(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="max-w-2xl mx-auto">
      {!result ? (
        <div className="bg-white rounded-lg shadow-sm p-8">
          {!preview ? (
            <div
              className="border-2 border-dashed border-[#D4C5A9] rounded-lg p-12 text-center cursor-pointer hover:border-[#C8A951] transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
            >
              <svg className="w-12 h-12 text-[#8B8680] mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="text-[#2D2D2D] font-medium mb-1">Upload a plant photo</p>
              <p className="text-[#8B8680] text-sm">Click to browse or drag & drop</p>
              <p className="text-[#8B8680] text-xs mt-2">JPG, PNG, WebP — max 5MB</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>
          ) : (
            <div>
              <img src={preview} alt="Plant to identify" className="w-full max-h-80 object-contain rounded-lg mb-6" />
              <div className="flex gap-3 justify-center">
                <button
                  onClick={identify}
                  disabled={loading}
                  className="bg-[#C8A951] text-white px-8 py-3 rounded text-sm uppercase tracking-wider hover:bg-amber-600 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Identifying...' : 'Identify Plant'}
                </button>
                <button
                  onClick={reset}
                  className="border border-[#D4C5A9] text-[#2D2D2D] px-6 py-3 rounded text-sm hover:bg-[#D4C5A9]/20 transition-colors"
                >
                  Choose Another
                </button>
              </div>
            </div>
          )}
          {loading && (
            <div className="mt-6 text-center">
              <div className="inline-block w-8 h-8 border-2 border-[#C8A951] border-t-transparent rounded-full animate-spin"></div>
              <p className="text-[#8B8680] text-sm mt-2">Analysing your plant...</p>
            </div>
          )}
          {error && <p className="mt-4 text-red-600 text-center text-sm">{error}</p>}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm p-8">
          <div className="flex items-start gap-6 mb-8">
            {preview && <img src={preview} alt="Identified plant" className="w-24 h-24 object-cover rounded-lg shrink-0" />}
            <div>
              <h2 className="text-2xl font-serif text-[#1B3A2D]">{result.commonName}</h2>
              <p className="text-[#8B8680] italic">{result.botanicalName}</p>
              {result.family && <p className="text-[#8B8680] text-sm">Family: {result.family}</p>}
              {result.confidence && <span className="inline-block mt-2 bg-[#6B8F71]/10 text-[#6B8F71] text-xs px-3 py-1 rounded">{Math.round(result.confidence * 100)}% match</span>}
            </div>
          </div>

          {result.difficulty && (
            <div className="mb-6 p-4 bg-[#FAF8F5] rounded-lg">
              <span className="text-sm font-medium text-[#1B3A2D]">Difficulty: </span>
              <span className="text-sm text-[#8B8680]">{result.difficulty}</span>
            </div>
          )}

          <div className="space-y-4">
            {result.watering && (
              <div className="border-b border-[#D4C5A9]/30 pb-4">
                <h3 className="font-serif text-[#1B3A2D] mb-2">Watering</h3>
                <p className="text-sm text-[#8B8680]"><strong>Summer:</strong> {result.watering.summer}</p>
                <p className="text-sm text-[#8B8680]"><strong>Winter:</strong> {result.watering.winter}</p>
                {result.watering.tips && <p className="text-sm text-[#8B8680] mt-1">{result.watering.tips}</p>}
              </div>
            )}
            {result.light && <div className="border-b border-[#D4C5A9]/30 pb-4"><h3 className="font-serif text-[#1B3A2D] mb-1">Light</h3><p className="text-sm text-[#8B8680]">{result.light}</p></div>}
            {result.soil && <div className="border-b border-[#D4C5A9]/30 pb-4"><h3 className="font-serif text-[#1B3A2D] mb-1">Soil</h3><p className="text-sm text-[#8B8680]">{result.soil}</p></div>}
            {result.fertilising && <div className="border-b border-[#D4C5A9]/30 pb-4"><h3 className="font-serif text-[#1B3A2D] mb-1">Fertilising</h3><p className="text-sm text-[#8B8680]">{result.fertilising}</p></div>}
            {result.pruning && <div className="border-b border-[#D4C5A9]/30 pb-4"><h3 className="font-serif text-[#1B3A2D] mb-1">Pruning</h3><p className="text-sm text-[#8B8680]">{result.pruning}</p></div>}
            {result.pests && <div className="border-b border-[#D4C5A9]/30 pb-4"><h3 className="font-serif text-[#1B3A2D] mb-1">Pests & Diseases</h3><p className="text-sm text-[#8B8680]">{result.pests}</p></div>}
            {result.cyprusTips && <div className="border-b border-[#D4C5A9]/30 pb-4"><h3 className="font-serif text-[#1B3A2D] mb-1">Cyprus-Specific Tips</h3><p className="text-sm text-[#8B8680]">{result.cyprusTips}</p></div>}
            {result.bestPlantingTime && <div className="border-b border-[#D4C5A9]/30 pb-4"><h3 className="font-serif text-[#1B3A2D] mb-1">Best Planting Time</h3><p className="text-sm text-[#8B8680]">{result.bestPlantingTime}</p></div>}
            {result.companionPlants?.length > 0 && (
              <div className="pb-4">
                <h3 className="font-serif text-[#1B3A2D] mb-1">Companion Plants</h3>
                <p className="text-sm text-[#8B8680]">{result.companionPlants.join(', ')}</p>
              </div>
            )}
          </div>

          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <button
              onClick={reset}
              className="bg-[#C8A951] text-white px-6 py-3 rounded text-sm uppercase tracking-wider hover:bg-amber-600 transition-colors"
            >
              Identify Another Plant
            </button>
            <a
              href="/contact"
              className="border border-[#1B3A2D] text-[#1B3A2D] px-6 py-3 rounded text-sm text-center uppercase tracking-wider hover:bg-[#1B3A2D] hover:text-white transition-colors"
            >
              Need Professional Help?
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
