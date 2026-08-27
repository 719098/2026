export interface Country {
  code: string;       // ISO 2-letter code (e.g., 'TW', 'JP')
  nameZh: string;     // Chinese Name (e.g., '台灣', '日本')
  nameEn: string;     // English Name (e.g., 'Taiwan', 'Japan')
  flag: string;       // Emoji Flag (e.g., '🇹🇼', '🇯🇵')
  continent: string;  // Region (亞洲, 歐洲, 北美洲, 南美洲, 非洲, 大洋洲)
}

export const CONTINENTS = ['全部', '亞洲', '歐洲', '北美洲', '南美洲', '非洲', '大洋洲'] as const;

export const COUNTRIES: Country[] = [
  // 亞洲 (Asia)
  { code: 'TW', nameZh: '台灣', nameEn: 'Taiwan', flag: '🇹🇼', continent: '亞洲' },
  { code: 'JP', nameZh: '日本', nameEn: 'Japan', flag: '🇯🇵', continent: '亞洲' },
  { code: 'KR', nameZh: '韓國', nameEn: 'South Korea', flag: '🇰🇷', continent: '亞洲' },
  { code: 'CN', nameZh: '中國', nameEn: 'China', flag: '🇨🇳', continent: '亞洲' },
  { code: 'HK', nameZh: '香港', nameEn: 'Hong Kong', flag: '🇭🇰', continent: '亞洲' },
  { code: 'MO', nameZh: '澳門', nameEn: 'Macau', flag: '🇲🇴', continent: '亞洲' },
  { code: 'SG', nameZh: '新加坡', nameEn: 'Singapore', flag: '🇸🇬', continent: '亞洲' },
  { code: 'MY', nameZh: '馬來西亞', nameEn: 'Malaysia', flag: '🇲🇾', continent: '亞洲' },
  { code: 'TH', nameZh: '泰國', nameEn: 'Thailand', flag: '🇹🇭', continent: '亞洲' },
  { code: 'VN', nameZh: '越南', nameEn: 'Vietnam', flag: '🇻🇳', continent: '亞洲' },
  { code: 'PH', nameZh: '菲律賓', nameEn: 'Philippines', flag: '🇵🇭', continent: '亞洲' },
  { code: 'ID', nameZh: '印尼', nameEn: 'Indonesia', flag: '🇮🇩', continent: '亞洲' },
  { code: 'IN', nameZh: '印度', nameEn: 'India', flag: '🇮🇳', continent: '亞洲' },
  { code: 'MN', nameZh: '蒙古', nameEn: 'Mongolia', flag: '🇲🇳', continent: '亞洲' },
  { code: 'MM', nameZh: '緬甸', nameEn: 'Myanmar', flag: '🇲🇲', continent: '亞洲' },
  { code: 'KH', nameZh: '柬埔寨', nameEn: 'Cambodia', flag: '🇰🇭', continent: '亞洲' },
  { code: 'LA', nameZh: '寮國', nameEn: 'Laos', flag: '🇱🇦', continent: '亞洲' },
  { code: 'NP', nameZh: '尼泊爾', nameEn: 'Nepal', flag: '🇳🇵', continent: '亞洲' },
  { code: 'LK', nameZh: '斯里蘭卡', nameEn: 'Sri Lanka', flag: '🇱🇰', continent: '亞洲' },
  { code: 'PK', nameZh: '巴基斯坦', nameEn: 'Pakistan', flag: '🇵🇰', continent: '亞洲' },
  { code: 'BD', nameZh: '孟加拉', nameEn: 'Bangladesh', flag: '🇧🇩', continent: '亞洲' },
  { code: 'TR', nameZh: '土耳其', nameEn: 'Turkey', flag: '🇹🇷', continent: '亞洲' },
  { code: 'IL', nameZh: '以色列', nameEn: 'Israel', flag: '🇮🇱', continent: '亞洲' },
  { code: 'SA', nameZh: '沙烏地阿拉伯', nameEn: 'Saudi Arabia', flag: '🇸🇦', continent: '亞洲' },
  { code: 'AE', nameZh: '阿拉伯聯合大公國', nameEn: 'UAE', flag: '🇦🇪', continent: '亞洲' },
  { code: 'JO', nameZh: '約旦', nameEn: 'Jordan', flag: '🇯🇴', continent: '亞洲' },

  // 北美洲 (North America)
  { code: 'US', nameZh: '美國', nameEn: 'United States', flag: '🇺🇸', continent: '北美洲' },
  { code: 'CA', nameZh: '加拿大', nameEn: 'Canada', flag: '🇨🇦', continent: '北美洲' },
  { code: 'MX', nameZh: '墨西哥', nameEn: 'Mexico', flag: '🇲🇽', continent: '北美洲' },
  { code: 'CR', nameZh: '哥斯大黎加', nameEn: 'Costa Rica', flag: '🇨🇷', continent: '北美洲' },
  { code: 'PA', nameZh: '巴拿馬', nameEn: 'Panama', flag: '🇵🇦', continent: '北美洲' },
  { code: 'GT', nameZh: '危地馬拉', nameEn: 'Guatemala', flag: '🇬🇹', continent: '北美洲' },
  { code: 'JM', nameZh: '牙買加', nameEn: 'Jamaica', flag: '🇯🇲', continent: '北美洲' },

  // 南美洲 (South America)
  { code: 'BR', nameZh: '巴西', nameEn: 'Brazil', flag: '🇧🇷', continent: '南美洲' },
  { code: 'AR', nameZh: '阿根廷', nameEn: 'Argentina', flag: '🇦🇷', continent: '南美洲' },
  { code: 'CL', nameZh: '智利', nameEn: 'Chile', flag: '🇨🇱', continent: '南美洲' },
  { code: 'CO', nameZh: '哥倫比亞', nameEn: 'Colombia', flag: '🇨🇴', continent: '南美洲' },
  { code: 'PE', nameZh: '秘魯', nameEn: 'Peru', flag: '🇵🇪', continent: '南美洲' },
  { code: 'EC', nameZh: '厄瓜多', nameEn: 'Ecuador', flag: '🇪🇨', continent: '南美洲' },
  { code: 'UY', nameZh: '烏拉圭', nameEn: 'Uruguay', flag: '🇺🇾', continent: '南美洲' },
  { code: 'PY', nameZh: '巴拉圭', nameEn: 'Paraguay', flag: '🇵🇾', continent: '南美洲' },

  // 歐洲 (Europe)
  { code: 'GB', nameZh: '英國', nameEn: 'United Kingdom', flag: '🇬🇧', continent: '歐洲' },
  { code: 'FR', nameZh: '法國', nameEn: 'France', flag: '🇫🇷', continent: '歐洲' },
  { code: 'DE', nameZh: '德國', nameEn: 'Germany', flag: '🇩🇪', continent: '歐洲' },
  { code: 'IT', nameZh: '義大利', nameEn: 'Italy', flag: '🇮🇹', continent: '歐洲' },
  { code: 'ES', nameZh: '西班牙', nameEn: 'Spain', flag: '🇪🇸', continent: '歐洲' },
  { code: 'PT', nameZh: '葡萄牙', nameEn: 'Portugal', flag: '🇵🇹', continent: '歐洲' },
  { code: 'NL', nameZh: '荷蘭', nameEn: 'Netherlands', flag: '🇳🇱', continent: '歐洲' },
  { code: 'BE', nameZh: '比利時', nameEn: 'Belgium', flag: '🇧🇪', continent: '歐洲' },
  { code: 'CH', nameZh: '瑞士', nameEn: 'Switzerland', flag: '🇨🇭', continent: '歐洲' },
  { code: 'AT', nameZh: '奧地利', nameEn: 'Austria', flag: '🇦🇹', continent: '歐洲' },
  { code: 'SE', nameZh: '瑞典', nameEn: 'Sweden', flag: '🇸🇪', continent: '歐洲' },
  { code: 'NO', nameZh: '挪威', nameEn: 'Norway', flag: '🇳🇴', continent: '歐洲' },
  { code: 'DK', nameZh: '丹麥', nameEn: 'Denmark', flag: '🇩🇰', continent: '歐洲' },
  { code: 'FI', nameZh: '芬蘭', nameEn: 'Finland', flag: '🇫🇮', continent: '歐洲' },
  { code: 'PL', nameZh: '波蘭', nameEn: 'Poland', flag: '🇵🇱', continent: '歐洲' },
  { code: 'CZ', nameZh: '捷克', nameEn: 'Czech Republic', flag: '🇨🇿', continent: '歐洲' },
  { code: 'HU', nameZh: '匈牙利', nameEn: 'Hungary', flag: '🇭🇺', continent: '歐洲' },
  { code: 'RO', nameZh: '羅馬尼亞', nameEn: 'Romania', flag: '🇷🇴', continent: '歐洲' },
  { code: 'GR', nameZh: '希臘', nameEn: 'Greece', flag: '🇬🇷', continent: '歐洲' },
  { code: 'IE', nameZh: '愛爾蘭', nameEn: 'Ireland', flag: '🇮🇪', continent: '歐洲' },
  { code: 'RU', nameZh: '俄羅斯', nameEn: 'Russia', flag: '🇷🇺', continent: '歐洲' },
  { code: 'UA', nameZh: '烏克蘭', nameEn: 'Ukraine', flag: '🇺🇦', continent: '歐洲' },
  { code: 'SK', nameZh: '斯洛伐克', nameEn: 'Slovakia', flag: '🇸🇰', continent: '歐洲' },
  { code: 'HR', nameZh: '克羅埃西亞', nameEn: 'Croatia', flag: '🇭🇷', continent: '歐洲' },

  // 大洋洲 (Oceania)
  { code: 'AU', nameZh: '澳洲', nameEn: 'Australia', flag: '🇦🇺', continent: '大洋洲' },
  { code: 'NZ', nameZh: '紐西蘭', nameEn: 'New Zealand', flag: '🇳🇿', continent: '大洋洲' },
  { code: 'FJ', nameZh: '斐濟', nameEn: 'Fiji', flag: '🇫🇯', continent: '大洋洲' },
  { code: 'PG', nameZh: '巴布亞紐幾內亞', nameEn: 'Papua New Guinea', flag: '🇵🇬', continent: '大洋洲' },
  { code: 'GUM', nameZh: '關島', nameEn: 'Guam', flag: '🇬🇺', continent: '大洋洲' },

  // 非洲 (Africa)
  { code: 'ZA', nameZh: '南非', nameEn: 'South Africa', flag: '🇿🇦', continent: '非洲' },
  { code: 'EG', nameZh: '埃及', nameEn: 'Egypt', flag: '🇪🇬', continent: '非洲' },
  { code: 'MA', nameZh: '摩洛哥', nameEn: 'Morocco', flag: '🇲🇦', continent: '非洲' },
  { code: 'KE', nameZh: '肯亞', nameEn: 'Kenya', flag: '🇰🇪', continent: '非洲' },
  { code: 'NG', nameZh: '奈及利亞', nameEn: 'Nigeria', flag: '🇳🇬', continent: '非洲' },
  { code: 'GH', nameZh: '迦納', nameEn: 'Ghana', flag: '🇬🇭', continent: '非洲' },
  { code: 'ET', nameZh: '衣索比亞', nameEn: 'Ethiopia', flag: '🇪🇹', continent: '非洲' },
  { code: 'TN', nameZh: '突尼斯', nameEn: 'Tunisia', flag: '🇹🇳', continent: '非洲' },
  { code: 'TZ', nameZh: '坦尚尼亞', nameEn: 'Tanzania', flag: '🇹🇿', continent: '非洲' },
  { code: 'UG', nameZh: '烏干達', nameEn: 'Uganda', flag: '🇺🇬', continent: '非洲' }
];

// Quick mapping dictionary for code resolution
export const NATIONALITY_TO_CODE: Record<string, string> = COUNTRIES.reduce((acc, c) => {
  acc[c.nameZh] = c.code;
  acc[c.nameEn] = c.code;
  return acc;
}, {} as Record<string, string>);

/**
 * Find country object by Chinese name, English name, or Code
 */
export function getCountryByNameOrCode(query?: string): Country | undefined {
  if (!query) return undefined;
  const q = query.trim().toLowerCase();
  return COUNTRIES.find(
    c =>
      c.code.toLowerCase() === q ||
      c.nameZh.toLowerCase() === q ||
      c.nameEn.toLowerCase() === q
  );
}

/**
 * Filter countries based on search string and continent filter
 */
export function filterCountries(searchQuery: string, continent: string = '全部'): Country[] {
  let list = COUNTRIES;
  if (continent !== '全部') {
    list = list.filter(c => c.continent === continent);
  }

  const q = searchQuery.trim().toLowerCase();
  if (!q) return list;

  return list.filter(
    c =>
      c.nameZh.toLowerCase().includes(q) ||
      c.nameEn.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q)
  );
}
