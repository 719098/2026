import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, Globe } from 'lucide-react';
import { COUNTRIES, CONTINENTS, filterCountries, getCountryByNameOrCode, Country } from '../data/countries';

interface NationalitySelectProps {
  value: string;
  onChange: (nationalityNameZh: string, countryCode: string) => void;
  className?: string;
  disabled?: boolean;
}

export const NationalitySelect: React.FC<NationalitySelectProps> = ({
  value,
  onChange,
  className = '',
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContinent, setSelectedContinent] = useState<string>('全部');
  const containerRef = useRef<HTMLDivElement>(null);

  // Match current selected country
  const currentCountry = useMemo(() => {
    return getCountryByNameOrCode(value);
  }, [value]);

  // Filtered countries list
  const filteredList = useMemo(() => {
    return filterCountries(searchQuery, selectedContinent);
  }, [searchQuery, selectedContinent]);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (country: Country) => {
    onChange(country.nameZh, country.code);
    setIsOpen(false);
    setSearchQuery('');
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Select trigger button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg border text-sm transition-all bg-white text-zinc-900 border-zinc-200 hover:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-900 ${
          disabled ? 'opacity-50 cursor-not-allowed bg-zinc-50' : 'cursor-pointer shadow-2xs'
        }`}
      >
        <div className="flex items-center space-x-2.5 min-w-0">
          {currentCountry ? (
            <>
              <span className="text-lg leading-none shrink-0">{currentCountry.flag}</span>
              <span className="font-medium text-zinc-900 truncate">{currentCountry.nameZh}</span>
              <span className="text-xs text-zinc-400 font-normal truncate">({currentCountry.nameEn})</span>
            </>
          ) : value ? (
            <>
              <Globe className="w-4 h-4 text-zinc-400 shrink-0" />
              <span className="font-medium text-zinc-900 truncate">{value}</span>
            </>
          ) : (
            <>
              <Globe className="w-4 h-4 text-zinc-400 shrink-0" />
              <span className="text-zinc-400 font-normal">選擇國籍 / 地區...</span>
            </>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180 text-zinc-700' : ''}`} />
      </button>

      {/* Searchable Dropdown Popover */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white border border-zinc-200 rounded-xl shadow-xl overflow-hidden text-sm flex flex-col max-h-80 min-w-[280px]">
          {/* Search Bar */}
          <div className="p-2 border-b border-zinc-100 bg-zinc-50/70">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜尋國家/地區 (如 Japan, 日本, US)..."
                autoFocus
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-md focus:outline-none focus:border-zinc-900 text-zinc-900 placeholder:text-zinc-400"
              />
            </div>

            {/* Continent Tabs */}
            <div className="flex items-center gap-1 mt-2 overflow-x-auto pb-1 text-[11px] scrollbar-none">
              {CONTINENTS.map((continent) => (
                <button
                  key={continent}
                  type="button"
                  onClick={() => setSelectedContinent(continent)}
                  className={`px-2 py-0.5 rounded-md shrink-0 font-medium transition-colors ${
                    selectedContinent === continent
                      ? 'bg-zinc-900 text-white'
                      : 'bg-zinc-200/60 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  {continent}
                </button>
              ))}
            </div>
          </div>

          {/* Country List Options */}
          <div className="overflow-y-auto flex-1 p-1 divide-y divide-zinc-50">
            {filteredList.length === 0 ? (
              <div className="p-4 text-center text-xs text-zinc-400">
                未找到符合的國家或地區
              </div>
            ) : (
              filteredList.map((country) => {
                const isSelected =
                  currentCountry?.code === country.code ||
                  value === country.nameZh ||
                  value === country.nameEn;
                return (
                  <button
                    key={country.code}
                    type="button"
                    onClick={() => handleSelect(country)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors text-xs ${
                      isSelected
                        ? 'bg-zinc-100 text-zinc-900 font-semibold'
                        : 'hover:bg-zinc-50 text-zinc-700'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <span className="text-base leading-none">{country.flag}</span>
                      <span className="font-medium text-zinc-900">{country.nameZh}</span>
                      <span className="text-zinc-400 text-[11px]">({country.nameEn})</span>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-zinc-900 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
