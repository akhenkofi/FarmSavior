import { useEffect, useMemo, useRef, useState } from 'react'
import * as api from './services/api'

const errMsg = (e) => e?.response?.data?.detail || e?.message || 'Request failed'

const countries = ['GH', 'NG', 'BF']
const countryLabels = { GH: 'Ghana (GH)', NG: 'Nigeria (NG)', BF: 'Burkina Faso (BF)' }
const userTypes = ['Farmer', 'Buyer', 'Transporter', 'EquipmentProvider', 'StorageProvider']
const cropOptions = ['Cassava','Maize','Tomato','Rice','Yam','Plantain','Onion','Pepper','Cocoa','Sorghum','Millet','Groundnut']
const animalOptions = ['Poultry','Goats','Sheep','Cattle','Rabbits','Grasscutters','Horses','Dogs']

const featuredProductsSeed = [
  { name: 'Goats' },
  { name: 'Sheep' },
  { name: 'Day-old Chicks' },
  { name: 'Cows' },
  { name: 'Cashew' },
  { name: 'Mango' },
  { name: 'Coconuts' },
  { name: 'Coffee' },
  { name: 'Cocoa' },
  { name: 'Rice' }
]

const featuredServicesSeed = [
  { name: 'Tractor hire (4WD)' },
  { name: 'Combine harvester rental' },
  { name: 'Cold room storage' },
  { name: 'Long-haul truck logistics' },
  { name: 'Farm spraying service' },
  { name: 'Irrigation setup service' },
  { name: 'Feed supply delivery' },
  { name: 'Warehouse monthly leasing' },
  { name: 'Farm consultancy' },
  { name: 'Ram/Buck/Bull rentals' }
]

const featuredServiceBaselineCount = {
  'Farm consultancy': 1
}

const productNameFr = {
  'Goats': 'Chèvres',
  'Sheep': 'Moutons',
  'Day-old Chicks': "Poussins d’un jour",
  'Cows': 'Vaches',
  'Cashew': 'Noix de cajou',
  'Mango': 'Mangue',
  'Coconuts': 'Noix de coco',
  'Coffee': 'Café',
  'Cocoa': 'Cacao',
  'Rice': 'Riz'
}

const serviceNameFr = {
  'Tractor hire (4WD)': 'Location de tracteur (4x4)',
  'Combine harvester rental': 'Location de moissonneuse-batteuse',
  'Cold room storage': 'Stockage en chambre froide',
  'Long-haul truck logistics': 'Logistique camion longue distance',
  'Farm spraying service': 'Service de pulvérisation agricole',
  'Irrigation setup service': 'Service d’installation d’irrigation',
  'Feed supply delivery': "Livraison d’aliments pour bétail",
  'Warehouse monthly leasing': 'Location mensuelle d’entrepôt',
  'Farm consultancy': 'Conseil agricole',
  'Ram/Buck/Bull rentals': 'Location de bélier/bouc/taureau'
}

const weatherConditionFr = {
  'Partly cloudy': 'Partiellement nuageux',
  'Cloudy': 'Nuageux',
  'Sunny': 'Ensoleillé',
  'Humid': 'Humide',
  'Hot': 'Chaud',
  'Clear': 'Dégagé',
  'Warm': 'Doux'
}

const newsTitleFr = {
  'West Africa input prices ease as supply chains stabilize': 'Les prix des intrants en Afrique de l’Ouest baissent avec la stabilisation des chaînes d’approvisionnement',
  'Moisture outlook improves for rice and maize belts': 'Les perspectives d’humidité s’améliorent pour les zones de riz et de maïs',
  'Regional livestock demand remains strong ahead of market week': 'La demande régionale en bétail reste forte avant la semaine de marché'
}

const featuredWeatherSeed = [
  { city: 'Accra', country: 'GH', condition: 'Partly cloudy', temperature_c: 29, humidity_pct: 74, rainfall_mm: 0.8 },
  { city: 'Kumasi', country: 'GH', condition: 'Cloudy', temperature_c: 27, humidity_pct: 79, rainfall_mm: 1.2 },
  { city: 'Tamale', country: 'GH', condition: 'Sunny', temperature_c: 33, humidity_pct: 55, rainfall_mm: 0.0 },
  { city: 'Lagos', country: 'NG', condition: 'Humid', temperature_c: 30, humidity_pct: 81, rainfall_mm: 1.5 },
  { city: 'Abuja', country: 'NG', condition: 'Cloudy', temperature_c: 28, humidity_pct: 67, rainfall_mm: 0.6 },
  { city: 'Kano', country: 'NG', condition: 'Sunny', temperature_c: 35, humidity_pct: 42, rainfall_mm: 0.0 },
  { city: 'Ouagadougou', country: 'BF', condition: 'Hot', temperature_c: 34, humidity_pct: 38, rainfall_mm: 0.0 },
  { city: 'Bobo-Dioulasso', country: 'BF', condition: 'Clear', temperature_c: 32, humidity_pct: 46, rainfall_mm: 0.0 },
  { city: 'Koudougou', country: 'BF', condition: 'Warm', temperature_c: 31, humidity_pct: 49, rainfall_mm: 0.2 }
]

const featuredNewsSeed = [
  { title: 'West Africa input prices ease as supply chains stabilize', url: 'https://www.farmsavior.com', source: 'FarmSavior Wire', published: 'Live', image_url: '', image_credit: 'FarmSavior' },
  { title: 'Moisture outlook improves for rice and maize belts', url: 'https://www.farmsavior.com', source: 'FarmSavior Weather Desk', published: 'Live', image_url: '', image_credit: 'FarmSavior' },
  { title: 'Regional livestock demand remains strong ahead of market week', url: 'https://www.farmsavior.com', source: 'FarmSavior Markets', published: 'Live', image_url: '', image_credit: 'FarmSavior' }
]

const featuredGovSeed = [
  { country: 'GH', agency: 'MOFA', headline: 'Official Program Updates', status: 'live', source_url: 'https://mofa.gov.gh/site/programmes/' },
  { country: 'NG', agency: 'Federal Ministry of Agriculture', headline: 'Program Announcements', status: 'live', source_url: 'https://agriculture.gov.ng/programs/' },
  { country: 'BF', agency: 'Ministère de l\'Agriculture', headline: 'Actualités du secteur', status: 'live', source_url: 'https://www.agriculture.gov.bf/quotidien/les-actualites' }
]

const featuredSpotSeed = [
  { commodity: 'Maize', GH: 12.5, NG: 380, BF: 360, WORLD_AVG: 250.8 },
  { commodity: 'Rice', GH: 680, NG: 620, BF: 590, WORLD_AVG: 630 },
  { commodity: 'Soybeans', GH: 430, NG: 470, BF: 420, WORLD_AVG: 455 }
]

const featuredSpotHistorySeed = [
  { commodity: 'Maize', change_pct_7d: 1.8, change_pct_30d: 4.4, trend_7d: [245, 246, 248, 249, 250, 251, 252], provenance: 'FarmSavior baseline feed' },
  { commodity: 'Rice', change_pct_7d: 0.9, change_pct_30d: 2.1, trend_7d: [624, 625, 626, 627, 628, 629, 630], provenance: 'FarmSavior baseline feed' },
  { commodity: 'Soybeans', change_pct_7d: -0.4, change_pct_30d: 1.3, trend_7d: [457, 456, 456, 455, 455, 455, 455], provenance: 'FarmSavior baseline feed' }
]

const _fallbackTradeCountries = ['Brazil','USA','India','China','France','Germany','Netherlands','Argentina','Australia','Canada']
const _mkTop10 = (base) => _fallbackTradeCountries.map((country, i) => ({ rank: i + 1, country, volume_tons: Math.max(2200000, Math.round(base - i * 700000)) }))

const featuredTradeExportSeed = [
  { commodity_key: 'poultry', commodity: 'Poultry', top_exporters: _mkTop10(11800000), top_importers: _mkTop10(11150000) },
  { commodity_key: 'sheep_goats', commodity: 'Sheep & Goats', top_exporters: _mkTop10(11950000), top_importers: _mkTop10(11270000) },
  { commodity_key: 'cattle', commodity: 'Cattle', top_exporters: _mkTop10(12100000), top_importers: _mkTop10(11390000) },
  { commodity_key: 'rice', commodity: 'Rice', top_exporters: _mkTop10(12250000), top_importers: _mkTop10(11510000) },
  { commodity_key: 'maize', commodity: 'Maize', top_exporters: _mkTop10(12400000), top_importers: _mkTop10(11630000) },
  { commodity_key: 'wheat', commodity: 'Wheat', top_exporters: _mkTop10(12550000), top_importers: _mkTop10(11750000) },
  { commodity_key: 'soybeans', commodity: 'Soybeans', top_exporters: _mkTop10(12700000), top_importers: _mkTop10(11870000) },
  { commodity_key: 'cocoa', commodity: 'Cocoa', top_exporters: _mkTop10(12850000), top_importers: _mkTop10(11990000) }
]

const featuredLivestockPlansSeed = [
  { name: 'Sheep & Goats Starter', monthly_usd: 4.99, yearly_usd: 49.99, features: ['Basic records', 'Health logs'] },
  { name: 'Sheep & Goats Pro', monthly_usd: 9.99, yearly_usd: 99.99, features: ['Breeding groups', 'Performance insights'] },
  { name: 'Sheep & Goats Enterprise', monthly_usd: 24.99, yearly_usd: 249.99, features: ['Multi-farm', 'Advanced analytics'] }
]

const paymentProviders = {
  GH: ['MTN MoMo', 'Vodafone Cash', 'AirtelTigo Money'],
  NG: ['OPay', 'PalmPay', 'Paga'],
  BF: ['Orange Money', 'Moov Money']
}
const currencyByCountry = { GH: 'GHS', NG: 'NGN', BF: 'XOF' }
const fxByCurrency = { USD: 1, GHS: 15, NGN: 1600, XOF: 610 }

// Locked by user request: High Demand Products/Services must always display 10 rows unless explicitly changed.
const DEMAND_LOCK_COUNT = 10
const lockDemandCount = (arr, fillerFactory) => {
  const out = [...arr]
  while (out.length < DEMAND_LOCK_COUNT) out.push(fillerFactory(out.length + 1))
  return out.slice(0, DEMAND_LOCK_COUNT)
}

function DataTable({ columns, rows, filterKey, onEdit }) {
  const [q, setQ] = useState('')
  const filtered = rows.filter((r) => !q || String(r[filterKey] ?? '').toLowerCase().includes(q.toLowerCase()))
  return <div>
    <input className='input filter' placeholder={`Filter by ${filterKey}...`} value={q} onChange={(e) => setQ(e.target.value)} />
    <table className='table'>
      <thead>
        <tr>
          {columns.map(c => <th key={c}>{c}</th>)}
          {onEdit && <th>actions</th>}
        </tr>
      </thead>
      <tbody>
        {filtered.map((r, i) => (
          <tr key={r.id || i}>
            {columns.map(c => <td key={c}>{String(r[c] ?? '')}</td>)}
            {onEdit && <td><button className='btn btn-dark' onClick={() => onEdit(r)}>Edit</button></td>}
          </tr>
        ))}
        {!filtered.length && <tr><td colSpan={columns.length + (onEdit ? 1 : 0)}>No records</td></tr>}
      </tbody>
    </table>
  </div>
}

export default function App() {
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams('')
  const forcePublicView = searchParams.get('public') === '1'
  const initialSection = searchParams.get('go') || 'home'
  const [token, setToken] = useState(localStorage.getItem('farmsavior_token'))
  const [authMode, setAuthMode] = useState('login')
  const [portalType, setPortalType] = useState('main')
  const [uiCountry, setUiCountry] = useState(() => localStorage.getItem('farmsavior_ui_country') || 'GH')
  const [uiLang, setUiLang] = useState(() => localStorage.getItem('farmsavior_ui_lang') || 'en')
  const [phoneForOtp, setPhoneForOtp] = useState('')
  const [authMsg, setAuthMsg] = useState('')
  const [active, setActive] = useState(initialSection)
  const [homeQuery, setHomeQuery] = useState('')
  const [publicQuery, setPublicQuery] = useState('')
  const [recentSearches, setRecentSearches] = useState([])
  const [recentViewed, setRecentViewed] = useState([])
  const [state, setState] = useState({ metrics: {}, users: [], listings: [], livestock: [], logistics: [], equipment: [], storage: [], payments: [], alerts: [], contracts: [], idv: [], passports: [], verificationApps: [], approvedAccounts: [], deviceTokens: [], diseaseScans: [], disputes: [], fraudFlags: [], news: [], publicWeather: [], govPrograms: [], spotTrading: [], spotHistory: [], tradeExportStats: [], livestockPlans: [] })
  const [me, setMe] = useState(null)
  const lastTrackRef = useRef('')

  const [signup, setSignup] = useState({ full_name: '', phone: '', country: 'GH', region: '', user_type: 'Farmer', password: '' })
  const [login, setLogin] = useState({ phone: '', password: '' })
  const [otp, setOtp] = useState({ phone: '', code: '' })

  const [idForm, setIdForm] = useState({ user_id: 1, id_type: 'GhanaCard', id_number: '', id_photo_url: '', facial_verification_flag: false })
  const [passportForm, setPassportForm] = useState({ user_id: 1, gps_lat: '', gps_lng: '', farm_size_hectares: '', crop_types: '[]', livestock_numbers: '{}', farm_photo_urls: '[]', harvest_records_notes: '' })
  const [cropForm, setCropForm] = useState({ farmer_id: 1, crop_name: '', quantity_kg: '', unit_price: '', location: '', country: 'GH', status: 'OPEN' })
  const [cropEdit, setCropEdit] = useState({ id: '', farmer_id: 1, crop_name: '', quantity_kg: '', unit_price: '', location: '', country: 'GH', status: 'OPEN' })
  const [cropQuickEdit, setCropQuickEdit] = useState({ id: '', quantity_kg: '', unit_price: '' })
  const [livestockForm, setLivestockForm] = useState({ farmer_id: 1, livestock_type: '', quantity: '', unit_price: '', location: '', country: 'GH', status: 'OPEN' })
  const [livestockEdit, setLivestockEdit] = useState({ id: '', farmer_id: 1, livestock_type: '', quantity: '', unit_price: '', location: '', country: 'GH', status: 'OPEN' })
  const [livestockQuickEdit, setLivestockQuickEdit] = useState({ id: '', quantity: '', unit_price: '' })
  const [logisticsForm, setLogisticsForm] = useState({ requester_id: 1, pickup_location: '', dropoff_location: '', cargo_type: '', weight_kg: '', status: 'PENDING' })
  const [logisticsEdit, setLogisticsEdit] = useState({ id: '', requester_id: 1, pickup_location: '', dropoff_location: '', cargo_type: '', weight_kg: '', status: 'PENDING' })
  const [equipmentForm, setEquipmentForm] = useState({ requester_id: 1, equipment_type: '', duration_days: '', location: '', budget: '', status: 'PENDING' })
  const [equipmentEdit, setEquipmentEdit] = useState({ id: '', requester_id: 1, equipment_type: '', duration_days: '', location: '', budget: '', status: 'PENDING' })
  const [storageForm, setStorageForm] = useState({ requester_id: 1, storage_type: '', quantity_kg: '', location: '', duration_days: '', status: 'PENDING' })
  const [storageEdit, setStorageEdit] = useState({ id: '', requester_id: 1, storage_type: '', quantity_kg: '', location: '', duration_days: '', status: 'PENDING' })
  const [paymentForm, setPaymentForm] = useState({ payer_id: 2, payee_id: 1, amount: '', country: 'GH', method: 'MobileMoney', provider: 'MTN MoMo', escrow_enabled: true })
  const [paymentEdit, setPaymentEdit] = useState({ id: '', payer_id: 2, payee_id: 1, amount: '', country: 'GH', method: 'MobileMoney', provider: 'MTN MoMo', escrow_enabled: true })
  const [alertForm, setAlertForm] = useState({ country: 'GH', region: '', severity: 'MEDIUM', alert_type: '', message: '', valid_until: '' })
  const [alertEdit, setAlertEdit] = useState({ id: '', country: 'GH', region: '', severity: 'MEDIUM', alert_type: '', message: '', valid_until: '' })
  const [alertCountryFilter, setAlertCountryFilter] = useState('ALL')
  const [regionMap, setRegionMap] = useState({ GH: [], NG: [], BF: [] })
  const [contractForm, setContractForm] = useState({ origin_country: 'GH', destination_country: 'NG', commodity: '', quantity: '', price: '', delivery_date: '', payment_terms: '', status: 'DRAFT' })
  const [contractEdit, setContractEdit] = useState({ id: '', origin_country: 'GH', destination_country: 'NG', commodity: '', quantity: '', price: '', delivery_date: '', payment_terms: '', status: 'DRAFT' })
  const [mapCountry, setMapCountry] = useState('GH')
  const [expandedWeatherCountry, setExpandedWeatherCountry] = useState('GH')
  const [expandedSpotCommodity, setExpandedSpotCommodity] = useState('')
  const [expandedTradeCommodity, setExpandedTradeCommodity] = useState('')
  const [expandedLivestockPlan, setExpandedLivestockPlan] = useState('')
  const [fxBase, setFxBase] = useState('USD')
  const [fxAmount, setFxAmount] = useState('1')
  const [fxRates, setFxRates] = useState({})
  const [fxUpdatedAt, setFxUpdatedAt] = useState('')
  const [fxQuery, setFxQuery] = useState('')

  const t = (en, fr) => (uiLang === 'fr' ? fr : en)
  const displayProductName = (name) => (uiLang === 'fr' ? (productNameFr[name] || name) : name)
  const displayServiceName = (name) => (uiLang === 'fr' ? (serviceNameFr[name] || name) : name)
  const displayWeatherCondition = (condition) => {
    if (uiLang !== 'fr') return condition
    const raw = String(condition || '')
    const normalized = raw.toLowerCase()
    const map = {
      'partly cloudy': 'Partiellement nuageux',
      'cloudy': 'Nuageux',
      'sunny': 'Ensoleillé',
      'humid': 'Humide',
      'hot': 'Chaud',
      'clear': 'Dégagé',
      'warm': 'Doux'
    }
    return map[normalized] || weatherConditionFr[raw] || raw
  }
  const displayNewsTitle = (title) => (uiLang === 'fr' ? (newsTitleFr[title] || title) : title)

  useEffect(() => {
    localStorage.setItem('farmsavior_ui_lang', uiLang)
  }, [uiLang])

  useEffect(() => {
    localStorage.setItem('farmsavior_ui_country', uiCountry)
  }, [uiCountry])

  const [fcmToken, setFcmToken] = useState('')
  const [diseaseForm, setDiseaseForm] = useState({ user_id: 1, category: 'crop', target: '', image_url: '' })
  const [diseaseImageFileName, setDiseaseImageFileName] = useState('')
  const [diseaseImagePreview, setDiseaseImagePreview] = useState('')
  const [farmMapForm, setFarmMapForm] = useState({ user_id: 1, gps_lat: '', gps_lng: '', farm_size_hectares: '', crop_types: '[]', livestock_numbers: '{}', farm_photo_urls: '[]', harvest_records_notes: '' })
  const [govSubsidyForm, setGovSubsidyForm] = useState({ country: 'GH', agency: 'MOFA', farmer_user_id: 1, amount: '' })
  const [govMsgForm, setGovMsgForm] = useState({ country: 'GH', target: 'farmers', text: '' })

  const load = async () => {
    const meRes = await api.fetchMe().catch(() => null)
    setMe(meRes)
    const isAdmin = (meRes?.role || '').toLowerCase() === 'admin'

    const [metrics, users, listings, livestock, logistics, equipment, storage, payments, alerts, contracts, idv, passports, regions, verificationApps, approvedAccounts, deviceTokens, diseaseScans, disputes, fraudFlags, news, publicWeather, govPrograms, spotTrading, spotHistory, tradeExportStats, livestockPlans] = await Promise.all([
      api.fetchMetrics(), api.fetchUsers(), api.fetchListings(), api.fetchLivestock(), api.fetchLogistics(), api.fetchEquipment(), api.fetchStorage(), api.fetchPayments(), api.fetchAlerts(alertCountryFilter === 'ALL' ? undefined : alertCountryFilter), api.fetchContracts(), api.fetchIdVerifications(), api.fetchPassports(), api.fetchWeatherRegions(), api.fetchVerificationApps(), api.fetchApprovedAccounts(), api.fetchDeviceTokens(), api.fetchDiseaseScans(),
      isAdmin ? api.fetchAdminDisputes() : Promise.resolve([]),
      isAdmin ? api.fetchAdminFraudFlags() : Promise.resolve([]),
      api.fetchPublicNews().catch(() => []),
      api.fetchPublicWeather().catch(() => []),
      api.fetchGovPrograms().catch(() => ({ items: [] })),
      api.fetchSpotTrading().catch(() => ({ items: [] })),
      api.fetchSpotTradingHistory().catch(() => ({ items: [] })),
      api.fetchTradeExportStats().catch(() => ({ items: [] })),
      api.fetchLivestockRecordsPlans().catch(() => ({ plans: [] }))
    ])
    setRegionMap(regions || { GH: [], NG: [], BF: [] })
    setState({ metrics, users, listings, livestock, logistics, equipment, storage, payments, alerts, contracts, idv, passports, verificationApps, approvedAccounts, deviceTokens, diseaseScans, disputes, fraudFlags, news, publicWeather, govPrograms: govPrograms.items || [], spotTrading: spotTrading.items || [], spotHistory: spotHistory.items || [], tradeExportStats: tradeExportStats.items || [], livestockPlans: livestockPlans.plans || [] })
  }

  useEffect(() => { if (token) load().catch(console.error) }, [token, alertCountryFilter])

  useEffect(() => {
    const key = `${token ? 'auth' : 'guest'}|${active}|${uiCountry}|${uiLang}`
    if (lastTrackRef.current === key) return
    lastTrackRef.current = key
    api.trackAnalyticsEvent({
      event_name: 'page_context',
      country: uiCountry,
      role_hint: me?.role || (token ? 'user' : 'guest'),
      properties: { active_page: active, language: uiLang, authenticated: !!token }
    }).catch(() => {})
  }, [token, active, uiCountry, uiLang, me?.role])

  useEffect(() => {
    setSignup((s) => ({ ...s, country: uiCountry }))
    setcropAndCountry()
  }, [uiCountry])

  useEffect(() => {
    let alive = true
    const loadFx = async () => {
      try {
        const res = await fetch(`https://open.er-api.com/v6/latest/${fxBase}`)
        const data = await res.json()
        if (!alive) return
        const rates = data?.rates || {}
        setFxRates(rates)
        setFxUpdatedAt(data?.time_last_update_utc || new Date().toUTCString())
      } catch {
        if (!alive) return
        setFxRates({})
      }
    }
    loadFx()
    const id = setInterval(loadFx, 10 * 60 * 1000)
    return () => { alive = false; clearInterval(id) }
  }, [fxBase])

  const setcropAndCountry = () => {
    setCropForm((s) => ({ ...s, country: uiCountry }))
    setCropEdit((s) => ({ ...s, country: uiCountry }))
    setLivestockForm((s) => ({ ...s, country: uiCountry }))
    setLivestockEdit((s) => ({ ...s, country: uiCountry }))
    setPaymentForm((s) => ({ ...s, country: uiCountry, provider: paymentProviders[uiCountry][0] }))
    setPaymentEdit((s) => ({ ...s, country: uiCountry, provider: paymentProviders[uiCountry][0] }))
    setAlertForm((s) => ({ ...s, country: uiCountry, region: '' }))
    setAlertEdit((s) => ({ ...s, country: uiCountry, region: '' }))
    setMapCountry(uiCountry)
  }

  useEffect(() => {
    if (token) return
    Promise.all([
      api.fetchListings().catch(() => []),
      api.fetchLivestock().catch(() => []),
      api.fetchLogistics().catch(() => []),
      api.fetchEquipment().catch(() => []),
      api.fetchStorage().catch(() => []),
      api.fetchAlerts().catch(() => []),
      api.fetchPublicNews().catch(() => []),
      api.fetchPublicWeather().catch(() => []),
      api.fetchGovPrograms().catch(() => ({ items: [] })),
      api.fetchSpotTrading().catch(() => ({ items: [] })),
      api.fetchSpotTradingHistory().catch(() => ({ items: [] })),
      api.fetchTradeExportStats().catch(() => ({ items: [] })),
      api.fetchLivestockRecordsPlans().catch(() => ({ plans: [] }))
    ]).then(([listings, livestock, logistics, equipment, storage, alerts, news, publicWeather, govPrograms, spotTrading, spotHistory, tradeExportStats, livestockPlans]) => {
      setState(prev => ({ ...prev, listings, livestock, logistics, equipment, storage, alerts, news, publicWeather, govPrograms: govPrograms.items || [], spotTrading: spotTrading.items || [], spotHistory: spotHistory.items || [], tradeExportStats: tradeExportStats.items || [], livestockPlans: livestockPlans.plans || [] }))
    })
  }, [token])

  const saveToken = (jwt) => {
    localStorage.setItem('farmsavior_token', jwt)
    setToken(jwt)
    setAuthMsg('Authenticated successfully')
  }

  const goToPublicHomepage = () => {
    window.location.href = '/?public=1'
  }

  const goToAppSection = (section = 'home') => {
    window.location.href = `/?public=0&go=${encodeURIComponent(section)}`
  }

  const recentsKey = `farmsavior_recents_${(token || 'guest').slice(0, 12)}`
  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(recentsKey) || '{}')
      setRecentSearches(parsed.searches || [])
      setRecentViewed(parsed.viewed || [])
    } catch {}
  }, [recentsKey])

  const persistRecents = (searches, viewed) => {
    localStorage.setItem(recentsKey, JSON.stringify({ searches, viewed }))
  }

  const addRecentSearch = (term) => {
    const t = String(term || '').trim()
    if (!t) return
    const next = [t, ...recentSearches.filter(x => x !== t)].slice(0, 8)
    setRecentSearches(next)
    persistRecents(next, recentViewed)
    api.trackAnalyticsEvent({
      event_name: 'search',
      country: uiCountry,
      role_hint: me?.role || (token ? 'user' : 'guest'),
      properties: { query: t, active_page: active }
    }).catch(() => {})
  }

  const addRecentViewed = (label) => {
    const t = String(label || '').trim()
    if (!t) return
    const next = [t, ...recentViewed.filter(x => x !== t)].slice(0, 10)
    setRecentViewed(next)
    persistRecents(recentSearches, next)
  }

  const baseMenu = ['home', 'dashboard', 'onboarding', 'products', 'livestock', 'services', 'payments', 'alerts', 'maps', 'messaging', 'ai-disease', 'government', 'contracts']
  const menu = ((me?.role || '').toLowerCase() === 'admin') ? [...baseMenu, 'admin'] : baseMenu
  const menuLabel = (m) => ({
    'home':'home',
    'dashboard':'dashboard',
    'onboarding':'onboarding',
    'products':'products',
    'livestock':'livestock',
    'services':'services',
    'payments':'payments',
    'alerts':'alerts',
    'maps':'maps',
    'messaging':'messaging',
    'ai-disease':'AI Disease Analyzer',
    'government':'Government Integration',
    'contracts':'contracts',
    'admin':'admin'
  }[m] || m)

  const kpis = useMemo(() => [
    ['Users', state.metrics.users_total || 0],
    ['Listings', state.metrics.listings_total || 0],
    ['Logistics', state.metrics.logistics_total || 0],
    ['Payments', state.metrics.payments_total || 0],
    ['Contracts', state.metrics.contracts_total || 0],
  ], [state.metrics])

  useEffect(() => {
    const tradeRows = state.tradeExportStats.length ? state.tradeExportStats : featuredTradeExportSeed
    if (!expandedTradeCommodity && tradeRows.length) {
      setExpandedTradeCommodity(tradeRows[0].commodity_key || tradeRows[0].commodity)
    }
  }, [state.tradeExportStats, expandedTradeCommodity])

  useEffect(() => {
    const spotRows = state.spotTrading.length ? state.spotTrading : featuredSpotSeed
    if (!expandedSpotCommodity && spotRows.length) {
      setExpandedSpotCommodity(spotRows[0].commodity)
    }
  }, [state.spotTrading, expandedSpotCommodity])

  useEffect(() => {
    const planRows = state.livestockPlans.length ? state.livestockPlans : featuredLivestockPlansSeed
    if (!expandedLivestockPlan && planRows.length) {
      setExpandedLivestockPlan(planRows[0].plan_code || planRows[0].name)
    }
  }, [expandedLivestockPlan, state.livestockPlans])

  const publicWeatherRows = state.publicWeather.length ? state.publicWeather : featuredWeatherSeed
  const publicNewsRows = state.news.length ? state.news : featuredNewsSeed
  const weatherByCountry = useMemo(() => {
    const out = { GH: [], NG: [], BF: [] }
    for (const w of publicWeatherRows) {
      const c = String(w.country || '').toUpperCase()
      if (out[c]) out[c].push(w)
    }
    return out
  }, [publicWeatherRows])

  const productInventoryByName = useMemo(() => {
    const merged = [...state.listings, ...state.livestock]
    const out = new Map()
    const norm = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ')

    const alias = {
      goats: ['goat', 'goats'],
      sheep: ['sheep'],
      'day old chicks': ['day old chicks', 'day-old chicks', 'chicks', 'poultry'],
      cows: ['cow', 'cows', 'cattle'],
      cashew: ['cashew', 'cashews'],
      mango: ['mango', 'mangoes'],
      coconuts: ['coconut', 'coconuts'],
      coffee: ['coffee'],
      cocoa: ['cocoa'],
      rice: ['rice']
    }

    for (const item of featuredProductsSeed) out.set(item.name, 0)

    merged.forEach((x) => {
      const rawName = norm(x.crop_name || x.livestock_type)
      const qty = Number(x.quantity_kg ?? x.quantity ?? 0)
      if (!rawName || !Number.isFinite(qty)) return

      for (const item of featuredProductsSeed) {
        const key = norm(item.name)
        const candidates = alias[key] || [key]
        if (candidates.some((c) => rawName.includes(c))) {
          out.set(item.name, Number(out.get(item.name) || 0) + qty)
          break
        }
      }
    })

    return out
  }, [state.listings, state.livestock])

  const serviceInventoryByName = useMemo(() => {
    const merged = [...state.logistics, ...state.equipment, ...state.storage]
    const out = new Map()
    const norm = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ')

    const alias = {
      'tractor hire 4wd': ['tractor', 'tractor hire'],
      'combine harvester rental': ['combine', 'harvester'],
      'cold room storage': ['cold room', 'cold storage', 'storage'],
      'long haul truck logistics': ['logistics', 'truck', 'haulage', 'transport'],
      'farm spraying service': ['spray', 'spraying'],
      'irrigation setup service': ['irrigation'],
      'feed supply delivery': ['feed'],
      'warehouse monthly leasing': ['warehouse', 'leasing'],
      'farm consultancy': ['consult', 'consultancy'],
      'ram buck bull rentals': ['ram', 'buck', 'bull']
    }

    for (const item of featuredServicesSeed) out.set(item.name, Number(featuredServiceBaselineCount[item.name] || 0))

    merged.forEach((x) => {
      const rawName = norm(x.pickup_location ? `${x.pickup_location} ${x.dropoff_location} ${x.cargo_type || ''}` : (x.equipment_type || x.storage_type || ''))
      if (!rawName) return

      for (const item of featuredServicesSeed) {
        const key = norm(item.name)
        const candidates = alias[key] || [key]
        if (candidates.some((c) => rawName.includes(c))) {
          out.set(item.name, Number(out.get(item.name) || 0) + 1)
          break
        }
      }
    })

    return out
  }, [state.logistics, state.equipment, state.storage])

  const publicGovRows = state.govPrograms.length ? state.govPrograms : featuredGovSeed
  const publicSpotRows = state.spotTrading.length ? state.spotTrading : featuredSpotSeed
  const publicSpotHistoryRows = state.spotHistory.length ? state.spotHistory : featuredSpotHistorySeed
  const publicTradeRows = state.tradeExportStats.length ? state.tradeExportStats : featuredTradeExportSeed
  const publicLivestockPlans = state.livestockPlans.length ? state.livestockPlans : featuredLivestockPlansSeed

  const fxRows = useMemo(() => {
    const amount = Number(fxAmount || 0)
    return Object.entries(fxRates || {})
      .filter(([code]) => !fxQuery || code.toLowerCase().includes(fxQuery.toLowerCase()))
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([code, rate]) => ({ code, value: (amount * Number(rate || 0)) }))
  }, [fxRates, fxAmount, fxQuery])

  const selectedCurrency = currencyByCountry[uiCountry] || 'USD'
  const formatLocalPrice = (usd) => {
    const amount = Number(usd || 0) * (fxByCurrency[selectedCurrency] || 1)
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: selectedCurrency, maximumFractionDigits: 2 }).format(amount) }
    catch { return `${selectedCurrency} ${amount.toFixed(2)}` }
  }

  const showPublicLanding = !token || forcePublicView

  if (showPublicLanding) return <div className='authWrap'>
    <div className='authCard' style={{width:'min(1180px,98vw)'}}>
      <div className='panel' style={{background:'linear-gradient(120deg,#0b3b2e,#0e7490)', color:'#fff'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:8}}>
          <img src='/assets/farmsavior-logo.jpg' alt='FarmSavior logo' style={{width:72,height:72,borderRadius:12,objectFit:'cover',border:'2px solid rgba(255,255,255,.3)'}} />
          <h2 style={{margin:0}}>{t('FarmSavior Marketplace Live','Marché FarmSavior en direct')}</h2>
        </div>
        <p style={{opacity:.95}}>{t('High-demand products and services across Ghana, Nigeria, and Burkina Faso. Browse freely. To contact providers or use tools, sign up/sign in.','Produits et services à forte demande au Ghana, au Nigeria et au Burkina Faso. Parcourez librement. Pour contacter les fournisseurs ou utiliser les outils, inscrivez-vous/connectez-vous.')}</p>
        <div className='inlineForm' style={{background:'rgba(255,255,255,.12)', border:'1px solid rgba(255,255,255,.25)', marginBottom:8}}>
          <select className='input' value={uiCountry} onChange={(e)=>setUiCountry(e.target.value)}>
            <option value='GH'>Ghana</option><option value='NG'>Nigeria</option><option value='BF'>Burkina Faso</option>
          </select>
          <select className='input' value={uiLang} onChange={(e)=>setUiLang(e.target.value)}>
            <option value='en'>English</option><option value='fr'>Français</option>
          </select>
          <div className='list-row' style={{padding:'6px 10px', background:'rgba(255,255,255,.85)'}}><span>{t('Currency','Devise')}</span><strong>{currencyByCountry[uiCountry]}</strong></div>
          <div className='list-row' style={{padding:'6px 10px', background:'rgba(255,255,255,.85)'}}><span>{t('Payment methods','Moyens de paiement')}</span><strong>{paymentProviders[uiCountry].join(', ')}</strong></div>
        </div>
        <form className='inlineForm' onSubmit={(e)=>{e.preventDefault(); addRecentSearch(publicQuery)}} style={{background:'rgba(255,255,255,.12)', border:'1px solid rgba(255,255,255,.25)'}}>
          <input className='input' placeholder={t('Search products, services, market activity…','Rechercher produits, services, activité du marché…')} value={publicQuery} onChange={(e)=>setPublicQuery(e.target.value)} />
          <button className='btn btn-dark'>{t('Search','Rechercher')}</button>
          <button type='button' className='btn' onClick={()=>setPublicQuery('')}>{t('Clear','Effacer')}</button>
        </form>
      </div>

      <div className='three-col' style={{marginTop:10}}>
        <article className='panel' style={{minHeight: 430}}>
          <h3>{t('🔥 High Demand Products','🔥 Produits à forte demande')}</h3>
          <div className='list'>
            {lockDemandCount(
              featuredProductsSeed.filter(x => !publicQuery || `${x.name}`.toLowerCase().includes(publicQuery.toLowerCase())),
              (n) => ({ name: `Market item ${n}` })
            ).map((x,i)=>{
              const inventory = Number(productInventoryByName.get(x.name) || 0)
              return <div className='list-row' key={`p-${i}`}><span>{displayProductName(x.name)}</span><strong>{inventory.toLocaleString()}</strong></div>
            })}
          </div>
        </article>

        <article className='panel' style={{minHeight: 430}}>
          <h3>{t('🚚 High Demand Services','🚚 Services à forte demande')}</h3>
          <div className='list'>
            {lockDemandCount(
              featuredServicesSeed.filter(x => !publicQuery || `${x.name}`.toLowerCase().includes(publicQuery.toLowerCase())),
              (n) => ({ name: `Service slot ${n}` })
            ).map((x,i)=>{
              const inventory = Number(serviceInventoryByName.get(x.name) || 0)
              return <div className='list-row' key={`s-${i}`}><span>{displayServiceName(x.name)}</span><strong>{inventory.toLocaleString()}</strong></div>
            })}
          </div>
        </article>

        <article className='panel'>
          <h3>{t('🧠 Popular Actions','🧠 Actions populaires')}</h3>
          <div className='list'>
            <div className='list-row'><span>{t('List Product','Publier un produit')}</span><button className='btn' onClick={()=>{ if (token) { goToAppSection('products'); return } setAuthMode('signup'); setAuthMsg(t('Create an account or log in to list a product.','Créez un compte ou connectez-vous pour publier un produit.')); }}>{t('Start','Démarrer')}</button></div>
            <div className='list-row'><span>{t('List Services','Publier des services')}</span><button className='btn' onClick={()=>{ if (token) { goToAppSection('services'); return } setAuthMode('signup'); setAuthMsg(t('Create an account or log in to list your services.','Créez un compte ou connectez-vous pour publier vos services.')); }}>{t('Start','Démarrer')}</button></div>
            <div className='list-row'><span>{t('List Machinery for Rent','Publier des machines à louer')}</span><button className='btn' onClick={()=>{ if (token) { goToAppSection('services'); return } setAuthMode('signup'); setAuthMsg(t('Sign up or log in to list machinery for rent.','Inscrivez-vous ou connectez-vous pour publier des machines à louer.')); }}>{t('Start','Démarrer')}</button></div>
            <div className='list-row'><span>{t('Rent Machinery','Louer des machines')}</span><button className='btn' onClick={()=>{ if (token) { goToAppSection('services'); return } setAuthMode('login'); setAuthMsg(t('Log in to rent machinery and contact providers.','Connectez-vous pour louer des machines et contacter les prestataires.')); }}>{t('Start','Démarrer')}</button></div>
            <div className='list-row'><span>{t('Request Logistics / Transport','Demander logistique / transport')}</span><button className='btn' onClick={()=>{ if (token) { goToAppSection('services'); return } setAuthMode('login'); setAuthMsg(t('Log in to request transport services.','Connectez-vous pour demander des services de transport.')); }}>{t('Start','Démarrer')}</button></div>
            <div className='list-row'><span>{t('Find Storage / Cold Room','Trouver stockage / chambre froide')}</span><button className='btn' onClick={()=>{ if (token) { goToAppSection('services'); return } setAuthMode('login'); setAuthMsg(t('Log in to reserve storage facilities.','Connectez-vous pour réserver des installations de stockage.')); }}>{t('Start','Démarrer')}</button></div>
            <div className='list-row'><span>{t('AI Disease Analyzer','Analyseur IA des maladies')}</span><button className='btn' onClick={()=>{ if (token) { goToAppSection('ai-disease'); return } setAuthMode('login'); setAuthMsg(t('Please sign in to use AI Disease Analyzer.','Veuillez vous connecter pour utiliser l’analyseur IA des maladies.')); }}>{t('Open','Ouvrir')}</button></div>
            <div className='list-row'><span>{t('Farm GPS Mapping','Cartographie GPS des fermes')}</span><button className='btn' onClick={()=>{ if (token) { goToAppSection('maps'); return } setAuthMode('login'); setAuthMsg(t('Please sign in to map farms and save data.','Veuillez vous connecter pour cartographier les fermes et enregistrer les données.')); }}>{t('Open','Ouvrir')}</button></div>
          </div>
          <p style={{fontSize:'.82rem', color:'#64748b'}}>{t('You can browse publicly; posting, renting, contacting providers, and transactions require sign-in.','Vous pouvez parcourir publiquement ; publier, louer, contacter des prestataires et effectuer des transactions nécessite une connexion.')}</p>
        </article>
      </div>

      <div className='two-col' style={{marginTop:10}}>
        <article className='panel'>
          <h3>{t('🌤️ 9-City Weather Forecast (Ghana • Nigeria • Burkina Faso)','🌤️ Prévisions météo de 9 villes (Ghana • Nigeria • Burkina Faso)')}</h3>
          <p style={{fontSize:'.82rem', color:'#64748b', margin:'4px 0 10px'}}>{t('Country codes: GH = Ghana, NG = Nigeria, BF = Burkina Faso.','Codes pays : GH = Ghana, NG = Nigeria, BF = Burkina Faso.')}</p>
          <div className='tabs' style={{marginBottom:10, flexWrap:'wrap'}}>
            {['GH','NG','BF'].map((c) => (
              <button key={`wx-${c}`} className={`tab ${expandedWeatherCountry === c ? 'active' : ''}`} onClick={() => setExpandedWeatherCountry(c)}>
                {countryLabels[c]}
              </button>
            ))}
          </div>
          <div className='news-grid'>
            {(weatherByCountry[expandedWeatherCountry] || []).map((w,i)=>(
              <div className='news-card' key={`w-${expandedWeatherCountry}-${i}`}>
                <div className='news-body'>
                  <div className='news-title'>{w.city}, {w.country}</div>
                  <div className='news-meta'>{t('Condition','Condition')}: {displayWeatherCondition(w.condition || '-')}</div>
                  <div className='news-meta'>{t('Temp','Temp')}: {w.temperature_c}°C • {t('Humidity','Humidité')}: {w.humidity_pct}% • {t('Rainfall','Pluie')}: {w.rainfall_mm} mm</div>
                </div>
              </div>
            ))}
          </div>

          <p style={{fontSize:'.85rem', color:'#0f766e', marginTop:8}}>{t('Free forecast preview for farmers. Sign up to unlock personalized alerts and farm-level recommendations.','Aperçu météo gratuit pour les agriculteurs. Inscrivez-vous pour débloquer des alertes personnalisées et des recommandations au niveau de l’exploitation.')}</p>


          <h3 style={{marginTop:12}}>{t('📰 Ag News + Innovation','📰 Actualités agricoles + innovation')}</h3>
          <div className='news-grid'>
            {publicNewsRows.slice(0,8).map((n,i)=>(
              <div className='news-card' key={`n-${i}`}>
                <img src={n.image_url || 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=80'} alt={n.title} className='news-img' />
                <div className='news-body'>
                  <a href={n.url} target='_blank' rel='noreferrer' className='news-title'>{displayNewsTitle(n.title)}</a>
                  <div className='news-meta'>{n.source} {n.published ? `• ${uiLang === 'fr' && n.published === 'Live' ? 'En direct' : n.published}` : ''}</div>
                  <div className='news-credit'>{n.image_credit || 'Image credit: source / Unsplash'}</div>
                </div>
              </div>
            ))}
          </div>
          <p style={{fontSize:'.82rem', color:'#64748b'}}>Sources and image credits are shown on each story.</p>
        </article>

        <article className='panel'>
          <h3>{t('Access Portal','Portail d’accès')}</h3>
          {token && <div className='panel' style={{padding:10, marginBottom:10, background:'#ecfeff', border:'1px solid #99f6e4'}}>
            <div style={{fontWeight:700, marginBottom:6}}>{t('You are signed in.','Vous êtes connecté.')}</div>
            <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
              <button className='btn btn-dark' onClick={() => { window.location.href='/?public=0' }}>{t('Go to My Account','Aller à mon compte')}</button>
              <button className='btn' onClick={() => { localStorage.removeItem('farmsavior_token'); setToken(''); setAuthMode('login') }}>{t('Log out','Se déconnecter')}</button>
            </div>
          </div>}
          {!token && <>
          <div className='tabs'>
            <button className='tab active' type='button'>Main App</button>
          </div>

          <div className='tabs'>{['login', 'signup', 'otp'].map(m => <button key={m} className={`tab ${authMode === m ? 'active' : ''}`} onClick={() => setAuthMode(m)}>{m.toUpperCase()}</button>)}</div>

          {authMode === 'signup' && <form className='list' onSubmit={async (e) => {
            try { e.preventDefault(); const r = await api.register(signup); setPhoneForOtp(signup.phone); setOtp({ ...otp, phone: signup.phone }); setAuthMode('otp'); setAuthMsg(`Registered. Use OTP: ${r.otp_mock_code}`); } catch (e) { setAuthMsg(`Signup failed: ${errMsg(e)}`) }
          }}>
            <input className='input' placeholder='Full name' value={signup.full_name} onChange={e => setSignup({ ...signup, full_name: e.target.value })} required />
            <input className='input' placeholder='Phone' value={signup.phone} onChange={e => setSignup({ ...signup, phone: e.target.value })} required />
            <div className='row2'><select className='input' value={signup.country} onChange={e => setSignup({ ...signup, country: e.target.value })}>{countries.map(c => <option key={c}>{c}</option>)}</select><input className='input' placeholder='Region' value={signup.region} onChange={e => setSignup({ ...signup, region: e.target.value })} required /></div>
            <select className='input' value={signup.user_type} onChange={e => setSignup({ ...signup, user_type: e.target.value })}>{userTypes.map(u => <option key={u}>{u}</option>)}</select>
            <input className='input' type='password' placeholder='Password' value={signup.password} onChange={e => setSignup({ ...signup, password: e.target.value })} required />
            <button className='btn btn-dark'>Create Account</button>
          </form>}

          {authMode === 'login' && <form className='list' onSubmit={async (e) => {
            try { e.preventDefault(); const r = await api.login(login); saveToken(r.access_token) } catch (e) { setAuthMsg(`Login failed: ${errMsg(e)}`) }
          }}>
            <input className='input' placeholder='Phone' value={login.phone} onChange={e => setLogin({ ...login, phone: e.target.value })} required />
            <input className='input' type='password' placeholder='Password' value={login.password} onChange={e => setLogin({ ...login, password: e.target.value })} required />
            <button className='btn btn-dark'>Login</button>
          </form>}

          {authMode === 'otp' && <form className='list' onSubmit={async (e) => {
            try { e.preventDefault(); const r = await api.verifyOtp(otp); saveToken(r.access_token) } catch (e) { setAuthMsg(`OTP verification failed: ${errMsg(e)}`) }
          }}>
            <input className='input' placeholder='Phone' value={otp.phone || phoneForOtp} onChange={e => setOtp({ ...otp, phone: e.target.value })} required />
            <input className='input' placeholder='OTP Code' value={otp.code} onChange={e => setOtp({ ...otp, code: e.target.value })} required />
            <button className='btn btn-dark'>Verify OTP</button>
          </form>}
          </>}
          <p>{authMsg}</p>

          <div className='panel' style={{marginTop:10,padding:10,background:'#f8fafc'}}>
            <h4 style={{margin:'0 0 6px'}}>{t('📲 Download App to Phone','📲 Télécharger l’application sur le téléphone')}</h4>
            <div style={{fontSize:'.84rem',color:'#334155'}}>
              <div><strong>{t('iPhone (Safari):','iPhone (Safari) :')}</strong> {t('Open farmsavior.com → Share → Add to Home Screen.','Ouvrez farmsavior.com → Partager → Sur l’écran d’accueil.')}</div>
              <div><strong>{t('Android (Chrome):','Android (Chrome) :')}</strong> {t('Open farmsavior.com → ⋮ menu → Install app / Add to Home screen.','Ouvrez farmsavior.com → menu ⋮ → Installer l’app / Ajouter à l’écran d’accueil.')}</div>
            </div>
          </div>

          <div className='list-row' style={{marginTop:12}}>
            <h3 style={{margin:0}}>{t('📈 Spot Trading (Ghana • Nigeria • Burkina Faso • World Avg)','📈 Trading Spot (Ghana • Nigeria • Burkina Faso • Moyenne mondiale)')}</h3>
            <button className='btn' onClick={() => window.print()}>{t('Export Briefing (PDF)','Exporter le briefing (PDF)')}</button>
          </div>
          <div className='tabs' style={{marginTop:8, marginBottom:8, flexWrap:'wrap'}}>
            {publicSpotRows.map((r, i) => (
              <button
                key={`spot-tab-${r.commodity || i}`}
                className={`tab ${expandedSpotCommodity === r.commodity ? 'active' : ''}`}
                onClick={() => setExpandedSpotCommodity(r.commodity)}
              >
                {r.commodity}
              </button>
            ))}
          </div>

          <div className='list'>
            {publicSpotRows
              .filter((r) => !expandedSpotCommodity || r.commodity === expandedSpotCommodity)
              .map((r, i) => {
                const hist = publicSpotHistoryRows.find(h => h.commodity === r.commodity) || {}
                const max = Math.max(r.GH || 0, r.NG || 0, r.BF || 0, r.WORLD_AVG || 0, 1)
                const bar = (v) => `${Math.max(6, Math.round((v / max) * 100))}%`
                const t7 = hist.trend_7d || []
                const min = Math.min(...(t7.length ? t7 : [0]))
                const max7 = Math.max(...(t7.length ? t7 : [1]))
                const points = t7.map((v, idx) => `${(idx/Math.max(1,t7.length-1))*180},${28-((v-min)/Math.max(1,(max7-min)))*24}`).join(' ')
                return <div key={`st-right-${i}`} className='panel' style={{padding:10}}>
                  <div style={{fontWeight:700, marginBottom:6}}>{r.commodity}</div>
                  <div style={{fontSize:12,color:'#64748b',marginBottom:6}}>{t('Date','Date')}: {r.updated_at_utc || hist.updated_at_utc || t('Live feed','Flux en direct')}</div>
                  <div className='list-row'><span>{t('Ghana','Ghana')} ({r.GH})</span><div style={{height:8,width:bar(r.GH),background:'#16a34a',borderRadius:99}} /></div>
                  <div className='list-row'><span>{t('Nigeria','Nigeria')} ({r.NG})</span><div style={{height:8,width:bar(r.NG),background:'#0284c7',borderRadius:99}} /></div>
                  <div className='list-row'><span>{t('Burkina Faso','Burkina Faso')} ({r.BF})</span><div style={{height:8,width:bar(r.BF),background:'#ea580c',borderRadius:99}} /></div>
                  <div className='list-row'><span>{t('World Avg','Moyenne mondiale')} ({r.WORLD_AVG})</span><div style={{height:8,width:bar(r.WORLD_AVG),background:'#334155',borderRadius:99}} /></div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'#475569',marginTop:6}}>
                    <span>7d: {hist.change_pct_7d ?? 0}%</span><span>30d: {hist.change_pct_30d ?? 0}%</span>
                  </div>
                  <svg width='180' height='32' style={{marginTop:4, background:'#f8fafc', borderRadius:6}}>
                    <polyline fill='none' stroke='#0f766e' strokeWidth='2' points={points || '0,28 180,4'} />
                  </svg>
                  <div style={{fontSize:11,color:'#64748b'}}>{t('Source','Source')}: {hist.provenance || t('FarmSavior market feed','Flux marché FarmSavior')}</div>
                </div>
              })}
          </div>
        </article>
      </div>

      <article className='panel' style={{marginTop:10}}>
        <h3>{t('🏛️ Government Programs & Subsidies (Ghana • Nigeria • Burkina Faso)','🏛️ Programmes gouvernementaux & subventions (Ghana • Nigeria • Burkina Faso)')}</h3>
        <div className='list'>
          {publicGovRows.slice(0, 6).map((g, i) => (
            <div className='list-row' key={`gov-${i}`}>
              <span>{g.country} • {g.agency} • {g.headline} ({g.status || 'ok'})</span>
              <a className='btn' href={g.source_url} target='_blank' rel='noreferrer'>{t('Programs Page','Page des programmes')}</a>
            </div>
          ))}
          {false && <div className='list-row'><span>Loading official ministry programs…</span></div>}
        </div>
      </article>

      <article className='panel' style={{marginTop:10}}>
        <h3>{t('🌍 Current Export/Import Statistics (Top 10 + Volumes)','🌍 Statistiques actuelles export/import (Top 10 + volumes)')}</h3>
        <p style={{fontSize:'.85rem',color:'#475569'}}>{t('Select a commodity below to expand its export/import rankings.','Sélectionnez une marchandise ci-dessous pour afficher ses classements export/import.')}</p>

        <div className='tabs' style={{marginBottom:10, flexWrap:'wrap'}}>
          {publicTradeRows.map((c, i) => {
            const key = c.commodity_key || c.commodity || `c-${i}`
            return (
              <button
                key={`trade-tab-${key}`}
                className={`tab ${expandedTradeCommodity === key ? 'active' : ''}`}
                onClick={() => setExpandedTradeCommodity(key)}
              >
                {c.commodity}
              </button>
            )
          })}
        </div>

        {publicTradeRows
          .filter((c, i) => (c.commodity_key || c.commodity || `c-${i}`) === expandedTradeCommodity)
          .map((c, i) => (
            <div className='panel' key={`trade-expanded-${i}`} style={{padding:10}}>
              <h4 style={{marginTop:0}}>{c.commodity}</h4>
              <div style={{fontWeight:600, marginBottom:6}}>{t('Top 10 Exporters','Top 10 exportateurs')}</div>
              <div className='list'>
                {(c.top_exporters || []).slice(0,10).map((r) => (
                  <div className='list-row' key={`exp-${c.commodity_key}-${r.rank}`}>
                    <span>{r.rank}. {r.country}</span>
                    <strong>{Number(r.volume_tons || 0).toLocaleString()} t</strong>
                  </div>
                ))}
              </div>
              <div style={{fontWeight:600, margin:'10px 0 6px'}}>{t('Top 10 Importers','Top 10 importateurs')}</div>
              <div className='list'>
                {(c.top_importers || []).slice(0,10).map((r) => (
                  <div className='list-row' key={`imp-${c.commodity_key}-${r.rank}`}>
                    <span>{r.rank}. {r.country}</span>
                    <strong>{Number(r.volume_tons || 0).toLocaleString()} t</strong>
                  </div>
                ))}
              </div>
            </div>
          ))}

        {false && <div className='list-row'><span>Loading current export/import statistics…</span></div>}
      </article>

      <article className='panel' style={{marginTop:10}}>
        <h3>{t('🐑 Sheep & Goats Records & Intelligence Platform (Africa-Wide)','🐑 Plateforme de registres et d’intelligence ovins/caprins (Afrique entière)')}</h3>
        <p style={{fontSize:'.85rem',color:'#475569'}}>{t('A production-grade livestock records system for sheep and goats, with traceability, breeding performance, health tracking, and subscription-based access for operators across Africa.','Un système professionnel de registres d’élevage pour ovins et caprins, avec traçabilité, performance de reproduction, suivi sanitaire et accès par abonnement pour les opérateurs en Afrique.')}</p>
        <p style={{fontSize:'.82rem',color:'#64748b',marginTop:4}}>{t('Pricing auto-displays in your selected country currency. Settlement can route to Ghana Mobile Money or US bank account once payout details are configured.','Les prix s’affichent automatiquement dans la devise du pays sélectionné. Le règlement peut être acheminé vers Mobile Money Ghana ou un compte bancaire US une fois les détails de paiement configurés.')}</p>
        <h4 style={{margin:'8px 0'}}>{t('Select Your Subscription Plan','Sélectionnez votre plan d’abonnement')}</h4>
        <div className='tabs' style={{marginBottom:10, flexWrap:'wrap'}}>
          {publicLivestockPlans.map((p, i) => {
            const key = p.plan_code || p.name || `plan-${i}`
            return <button key={`plan-tab-${key}`} className={`tab ${expandedLivestockPlan === key ? 'active' : ''}`} onClick={() => setExpandedLivestockPlan(key)}>{p.name}</button>
          })}
        </div>

        <div>
          {publicLivestockPlans
            .filter((p, i) => (p.plan_code || p.name || `plan-${i}`) === expandedLivestockPlan)
            .map((p, i) => (
            <div className='panel' key={`plan-${i}`} style={{padding:10}}>
              <h4 style={{marginTop:0}}>{p.name}</h4>
              <div className='list-row'><span>Monthly</span><strong>{formatLocalPrice(p.monthly_usd)}</strong></div>
              <div className='list-row'><span>Yearly</span><strong>{formatLocalPrice(p.yearly_usd)}</strong></div>
              <div className='list'>
                {(p.features || []).map((f, j) => <div className='list-row' key={`pf-${i}-${j}`}><span>{f}</span></div>)}
              </div>
              <div className='list-row' style={{marginTop:8}}>
                <button className='btn btn-dark' onClick={async () => {
                  if (!token) { setAuthMode('login'); setAuthMsg('Please login to subscribe.'); return }
                  try {
                    const r = await api.checkoutLivestockRecordsPlan({
                      user_id: Number(me?.id || 1),
                      plan_code: p.plan_code || 'starter',
                      country: uiCountry,
                      billing_cycle: 'monthly',
                      currency: selectedCurrency
                    })
                    if (r.payment_url) {
                      window.open(r.payment_url, '_blank')
                      alert(t(`Checkout started. Complete payment to activate. Ref: ${r.reference}`,`Paiement initié. Finalisez le paiement pour activer. Réf : ${r.reference}`))
                    } else {
                      alert(t(`Checkout created (payment provider not configured). Ref: ${r.reference}`,`Paiement créé (prestataire non configuré). Réf : ${r.reference}`))
                    }
                  } catch (e) { alert(t(`Checkout failed: ${errMsg(e)}`,`Échec du paiement : ${errMsg(e)}`)) }
                }}>Subscribe</button>
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className='panel' style={{marginTop:10}}>
        <h3>💱 {t('Global Currency Converter (Realtime)','Convertisseur de devises mondial (temps réel)')}</h3>
        <div className='inlineForm'>
          <input className='input' type='number' step='any' min='0' value={fxAmount} onChange={(e)=>setFxAmount(e.target.value)} placeholder={t('Amount','Montant')} />
          <select className='input' value={fxBase} onChange={(e)=>setFxBase(e.target.value)}>
            {Object.keys(fxRates || {}).sort().map((c)=><option key={c} value={c}>{c}</option>)}
            {!Object.keys(fxRates || {}).length && <option value='USD'>USD</option>}
          </select>
          <input className='input' value={fxQuery} onChange={(e)=>setFxQuery(e.target.value)} placeholder={t('Filter currency (e.g., GHS, NGN, EUR)','Filtrer devise (ex: GHS, NGN, EUR)')} />
        </div>
        <p style={{fontSize:'.82rem',color:'#64748b',margin:'6px 0 10px'}}>{t('Rates source','Source des taux')}: open.er-api.com • {t('Last updated','Dernière mise à jour')}: {fxUpdatedAt || '—'}</p>
        <div className='list' style={{maxHeight:320, overflow:'auto'}}>
          {fxRows.map((r)=>{
            const formatted = Number.isFinite(r.value) ? r.value.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '0'
            return <div className='list-row' key={`pub-fx-${r.code}`}><span>{r.code}</span><strong>{formatted}</strong></div>
          })}
          {!fxRows.length && <div className='list-row'><span>{t('No rates available right now.','Aucun taux disponible pour le moment.')}</span></div>}
        </div>
      </article>

      <div className='panel' style={{marginTop:10, fontSize:'.84rem', color:'#475569', display:'flex', gap:14, flexWrap:'wrap'}}>
        <a href='/privacy-policy.html' target='_blank' rel='noreferrer'>Privacy Policy</a>
        <a href='/terms-of-service.html' target='_blank' rel='noreferrer'>Terms of Service</a>
        <a href='/refund-policy.html' target='_blank' rel='noreferrer'>Refund Policy</a>
      </div>
    </div>
  </div>

  return <div className='layout'>
    <aside className='sidebar'>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
        <img src='/assets/farmsavior-logo.jpg' alt='FarmSavior' style={{width:36,height:36,borderRadius:8,objectFit:'cover'}} />
        <h3 style={{margin:0}}>FarmSavior</h3>
      </div>
      {menu.map(m => <button key={m} className={`sideBtn ${active === m ? 'on' : ''}`} onClick={() => setActive(m)}>{menuLabel(m)}</button>)}
      <button className='sideBtn' onClick={() => { localStorage.removeItem('farmsavior_token'); setToken('') }}>{t('logout','se déconnecter')}</button>
    </aside>
    <main className='main'>
      <div className='inlineForm' style={{marginBottom:10, justifyContent:'space-between'}}>
        <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
          <select className='input' value={uiCountry} onChange={(e)=>setUiCountry(e.target.value)}>
            <option value='GH'>Ghana</option><option value='NG'>Nigeria</option><option value='BF'>Burkina Faso</option>
          </select>
          <select className='input' value={uiLang} onChange={(e)=>setUiLang(e.target.value)}>
            <option value='en'>English</option><option value='fr'>Français</option>
          </select>
          <button className='btn btn-dark' onClick={() => setActive('home')}>{t('← Main Interface','← Interface principale')}</button>
          <button className='btn' onClick={() => setActive('products')}>{t('Products','Produits')}</button>
          <button className='btn' onClick={() => setActive('livestock')}>{t('Livestock','Élevage')}</button>
          <button className='btn' onClick={() => setActive('services')}>{t('Services','Services')}</button>
        </div>
        <div style={{display:'flex', gap:8}}>
          <button className='btn btn-dark' onClick={() => setActive('onboarding')}>{t('My Account','Mon compte')}</button>
          <button className='btn' onClick={goToPublicHomepage}>{t('Public Homepage','Page publique')}</button>
        </div>
      </div>
      {active === 'home' && <section>
        <h2>{t('Main App Homepage','Page d’accueil de l’application')}</h2>
        <form className='inlineForm' onSubmit={(e) => { e.preventDefault(); addRecentSearch(homeQuery) }}>
          <input className='input' placeholder={t('Search products, livestock, services…','Rechercher produits, élevage, services…')} value={homeQuery} onChange={(e)=>setHomeQuery(e.target.value)} />
          <button className='btn btn-dark' type='submit'>{t('Search','Rechercher')}</button>
        </form>
        <div className='two-col'>
          <article className='panel'>
            <h3>Search Results</h3>
            <div className='list'>
              {[...state.listings.map(x=>({type:'Product', id:x.id, name:x.crop_name, price:x.unit_price})), ...state.livestock.map(x=>({type:'Livestock', id:x.id, name:x.livestock_type, price:x.unit_price})), ...state.logistics.map(x=>({type:'Service', id:x.id, name:`${x.pickup_location} → ${x.dropoff_location}`, price:''}))]
                .filter(x => !homeQuery || `${x.type} ${x.name}`.toLowerCase().includes(homeQuery.toLowerCase()))
                .slice(0,20)
                .map((x,i)=><div className='list-row' key={`${x.type}-${x.id}-${i}`}><span>{x.type}: {x.name}</span><span>{x.price ? `₵${x.price}` : ''}</span></div>)}
            </div>
          </article>
          <article className='panel'>
            <h3>Recents</h3>
            <p><strong>Recent Searches</strong></p>
            <div className='list'>
              {recentSearches.map((s,i)=><div className='list-row' key={`s-${i}`}><span>{s}</span></div>)}
              {!recentSearches.length && <div className='list-row'><span>No recent searches yet</span></div>}
            </div>
            <p style={{marginTop:8}}><strong>Recently Viewed</strong></p>
            <div className='list'>
              {recentViewed.map((s,i)=><div className='list-row' key={`v-${i}`}><span>{s}</span></div>)}
              {!recentViewed.length && <div className='list-row'><span>No recently viewed yet</span></div>}
            </div>
          </article>
        </div>

        <article className='panel' style={{marginTop:10}}>
          <h3>💱 Global Currency Converter (Realtime)</h3>
          <div className='inlineForm'>
            <input className='input' type='number' step='any' min='0' value={fxAmount} onChange={(e)=>setFxAmount(e.target.value)} placeholder='Amount' />
            <select className='input' value={fxBase} onChange={(e)=>setFxBase(e.target.value)}>
              {Object.keys(fxRates || {}).sort().map((c)=><option key={c} value={c}>{c}</option>)}
              {!Object.keys(fxRates || {}).length && <option value='USD'>USD</option>}
            </select>
            <input className='input' value={fxQuery} onChange={(e)=>setFxQuery(e.target.value)} placeholder='Filter currency (e.g., GHS, NGN, EUR)' />
          </div>
          <p style={{fontSize:'.82rem',color:'#64748b',margin:'6px 0 10px'}}>Rates source: open.er-api.com • Last updated: {fxUpdatedAt || '—'}</p>
          <div className='list' style={{maxHeight:320, overflow:'auto'}}>
            {fxRows.map((r)=>{
              const formatted = Number.isFinite(r.value) ? r.value.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '0'
              return <div className='list-row' key={r.code}><span>{r.code}</span><strong>{formatted}</strong></div>
            })}
            {!fxRows.length && <div className='list-row'><span>No rates available right now.</span></div>}
          </div>
        </article>
      </section>}

      {active === 'dashboard' && <section>
        <h2>Admin Dashboard + Analytics</h2>
        <div className='kpi-grid'>{kpis.map(([k, v]) => <article className='kpi-card' key={k}><p>{k}</p><strong>{v}</strong></article>)}</div>

        <div className='two-col'>
          <article className='panel'>
            <h3>Crop Supply Forecasts</h3>
            <div className='list-row'><span>Total Crop Listings</span><strong>{state.listings.length}</strong></div>
            <div className='list-row'><span>Estimated Supply (kg)</span><strong>{state.listings.reduce((s,x)=>s+Number(x.quantity_kg||0),0).toFixed(0)}</strong></div>
            <div className='list-row'><span>30-day Outlook</span><strong>{state.listings.length > 5 ? 'High' : 'Moderate'}</strong></div>
          </article>
          <article className='panel'>
            <h3>Regional Production Data</h3>
            {['GH','NG','BF'].map(c => {
              const count = state.listings.filter(x => x.country === c).length
              return <div className='list-row' key={c}><span>{c}</span><strong>{count} listings</strong></div>
            })}
          </article>
        </div>

        <div className='two-col' style={{marginTop:10}}>
          <article className='panel'>
            <h3>Market Price Trends</h3>
            <div className='list-row'><span>Avg Crop Unit Price</span><strong>{(state.listings.reduce((s,x)=>s+Number(x.unit_price||0),0) / Math.max(state.listings.length,1)).toFixed(2)}</strong></div>
            <div className='list-row'><span>Avg Livestock Unit Price</span><strong>{(state.livestock.reduce((s,x)=>s+Number(x.unit_price||0),0) / Math.max(state.livestock.length,1)).toFixed(2)}</strong></div>
          </article>
          <article className='panel'>
            <h3>Logistics Activity + Farmer Growth</h3>
            <div className='list-row'><span>Active Logistics Requests</span><strong>{state.logistics.length}</strong></div>
            <div className='list-row'><span>Farmer Profiles</span><strong>{state.users.filter(u => (u.role||'') === 'Farmer').length}</strong></div>
            <div className='list-row'><span>Growth Signal</span><strong>{state.users.length > 5 ? 'Growing' : 'Early Stage'}</strong></div>
          </article>
        </div>

        <DataTable columns={['id', 'full_name', 'phone', 'country', 'region', 'role']} rows={state.users} filterKey='full_name' />
      </section>}

      {active === 'onboarding' && <section>
        <div className='two-col'>
          <article className='panel'><h3>ID Verification</h3><form className='list' onSubmit={async e => { e.preventDefault(); await api.createIdVerification({ ...idForm, user_id: Number(idForm.user_id) }); await load() }}>
            <input className='input' type='number' placeholder='User ID' value={idForm.user_id} onChange={e => setIdForm({ ...idForm, user_id: e.target.value })} />
            <select className='input' value={idForm.id_type} onChange={e => setIdForm({ ...idForm, id_type: e.target.value })}><option>GhanaCard</option><option>NIN</option><option>BF National ID</option></select>
            <input className='input' placeholder='ID Number' value={idForm.id_number} onChange={e => setIdForm({ ...idForm, id_number: e.target.value })} />
            <input className='input' placeholder='ID Photo URL' value={idForm.id_photo_url} onChange={e => setIdForm({ ...idForm, id_photo_url: e.target.value })} />
            <label><input type='checkbox' checked={idForm.facial_verification_flag} onChange={e => setIdForm({ ...idForm, facial_verification_flag: e.target.checked })} /> Facial verification done</label>
            <button className='btn btn-dark'>Save ID Verification</button>
          </form></article>
          <article className='panel'><h3>Digital Farm Passport</h3><form className='list' onSubmit={async e => { e.preventDefault(); await api.createPassport({ ...passportForm, user_id: Number(passportForm.user_id), gps_lat: Number(passportForm.gps_lat), gps_lng: Number(passportForm.gps_lng), farm_size_hectares: Number(passportForm.farm_size_hectares) }); await load() }}>
            <input className='input' type='number' placeholder='User ID' value={passportForm.user_id} onChange={e => setPassportForm({ ...passportForm, user_id: e.target.value })} />
            <div className='row2'><input className='input' placeholder='GPS Lat' value={passportForm.gps_lat} onChange={e => setPassportForm({ ...passportForm, gps_lat: e.target.value })} /><input className='input' placeholder='GPS Lng' value={passportForm.gps_lng} onChange={e => setPassportForm({ ...passportForm, gps_lng: e.target.value })} /></div>
            <input className='input' placeholder='Farm size (ha)' value={passportForm.farm_size_hectares} onChange={e => setPassportForm({ ...passportForm, farm_size_hectares: e.target.value })} />
            <input className='input' placeholder='Crop types JSON array' value={passportForm.crop_types} onChange={e => setPassportForm({ ...passportForm, crop_types: e.target.value })} />
            <input className='input' placeholder='Livestock JSON object' value={passportForm.livestock_numbers} onChange={e => setPassportForm({ ...passportForm, livestock_numbers: e.target.value })} />
            <input className='input' placeholder='Farm photos URLs JSON array' value={passportForm.farm_photo_urls} onChange={e => setPassportForm({ ...passportForm, farm_photo_urls: e.target.value })} />
            <input className='input' placeholder='Harvest notes' value={passportForm.harvest_records_notes} onChange={e => setPassportForm({ ...passportForm, harvest_records_notes: e.target.value })} />
            <button className='btn btn-dark'>Save Passport</button>
          </form></article>
        </div>

        <article className='panel' style={{marginTop: 12}}>
          <div className='panelHeadActions'>
            <h3>Verification Applications</h3>
            <button className='btn btn-dark' onClick={async () => { await api.analyzeAllVerifications(); await load(); }}>AI Analyze & Decide All</button>
          </div>
          <DataTable columns={['id_verification_id','full_name','phone','country','id_type','status','ai_score','ai_reason']} rows={state.verificationApps} filterKey='full_name' />
          <div className='inlineForm'>
            <input id='verifyAppId' className='input' placeholder='Application ID' />
            <button className='btn btn-dark' onClick={async ()=>{ const id=Number(document.getElementById('verifyAppId').value); if(id){ await api.analyzeVerification(id); await load(); }}}>Analyze One</button>
            <button className='btn btn-dark' onClick={async ()=>{ const id=Number(document.getElementById('verifyAppId').value); if(id){ await api.setVerificationDecision(id,{status:'APPROVED'}); await load(); }}}>Approve</button>
            <button className='btn btn-dark' onClick={async ()=>{ const id=Number(document.getElementById('verifyAppId').value); if(id){ await api.setVerificationDecision(id,{status:'DENIED'}); await load(); }}}>Deny</button>
          </div>
        </article>

        <article className='panel' style={{marginTop: 12}}>
          <h3>Verified Accounts (Approved)</h3>
          <DataTable columns={['user_id','full_name','phone','country','role','verified_status','ai_score']} rows={state.approvedAccounts} filterKey='full_name' />
        </article>
      </section>}

      {active === 'products' && <section><h3>Product Listings</h3><form className='inlineForm' onSubmit={async e => { e.preventDefault(); await api.createListing({ ...cropForm, farmer_id: Number(cropForm.farmer_id), quantity_kg: Number(cropForm.quantity_kg), unit_price: Number(cropForm.unit_price) }); await load() }}>
        <input className='input' placeholder='Crop' value={cropForm.crop_name} onChange={e => setCropForm({ ...cropForm, crop_name: e.target.value })} required />
        <input className='input' placeholder='Qty kg' value={cropForm.quantity_kg} onChange={e => setCropForm({ ...cropForm, quantity_kg: e.target.value })} required />
        <input className='input' placeholder='Unit price' value={cropForm.unit_price} onChange={e => setCropForm({ ...cropForm, unit_price: e.target.value })} required />
        <input className='input' placeholder='Location' value={cropForm.location} onChange={e => setCropForm({ ...cropForm, location: e.target.value })} />
        <button className='btn btn-dark'>Create</button>
      </form>
      <form className='inlineForm' onSubmit={async e => { e.preventDefault(); await api.updateListing(Number(cropEdit.id), { ...cropEdit, farmer_id: Number(cropEdit.farmer_id), quantity_kg: Number(cropEdit.quantity_kg), unit_price: Number(cropEdit.unit_price) }); await load() }}>
        <input className='input' placeholder='Listing ID to edit' value={cropEdit.id} onChange={e => setCropEdit({ ...cropEdit, id: e.target.value })} required />
        <input className='input' placeholder='Crop' value={cropEdit.crop_name} onChange={e => setCropEdit({ ...cropEdit, crop_name: e.target.value })} required />
        <input className='input' placeholder='Qty kg' value={cropEdit.quantity_kg} onChange={e => setCropEdit({ ...cropEdit, quantity_kg: e.target.value })} required />
        <input className='input' placeholder='Unit price' value={cropEdit.unit_price} onChange={e => setCropEdit({ ...cropEdit, unit_price: e.target.value })} required />
        <button className='btn btn-dark'>Save Edit</button>
      </form>
      <form className='inlineForm' onSubmit={async e => { e.preventDefault(); try { await api.patchListingPriceQty(Number(cropQuickEdit.id), { quantity_kg: Number(cropQuickEdit.quantity_kg), unit_price: Number(cropQuickEdit.unit_price) }); await load(); alert('Product update approved by AI and saved.'); } catch(err) { alert(err?.response?.data?.detail || 'Update denied/failed'); } }}>
        <input className='input' placeholder='Quick edit ID' value={cropQuickEdit.id} onChange={e => setCropQuickEdit({ ...cropQuickEdit, id: e.target.value })} required />
        <input className='input' placeholder='New quantity kg' value={cropQuickEdit.quantity_kg} onChange={e => setCropQuickEdit({ ...cropQuickEdit, quantity_kg: e.target.value })} required />
        <input className='input' placeholder='New unit price' value={cropQuickEdit.unit_price} onChange={e => setCropQuickEdit({ ...cropQuickEdit, unit_price: e.target.value })} required />
        <button className='btn btn-dark'>Quick Save Qty+Price</button>
      </form>
      <DataTable columns={['id', 'crop_name', 'quantity_kg', 'unit_price', 'country', 'status']} rows={state.listings} filterKey='crop_name' onEdit={(r) => {
        setCropEdit({
          id: r.id,
          farmer_id: r.farmer_id || 1,
          crop_name: r.crop_name || '',
          quantity_kg: r.quantity_kg || '',
          unit_price: r.unit_price || '',
          location: r.location || '',
          country: r.country || 'GH',
          status: r.status || 'OPEN'
        })
        setCropQuickEdit({ id: r.id, quantity_kg: r.quantity_kg || '', unit_price: r.unit_price || '' })
        addRecentViewed(`Product #${r.id} ${r.crop_name || ''}`)
      }} />
      <p style={{fontSize:'.85rem',color:'#475569'}}>Tip: click Edit on a row, update fields above, then Save Edit or Quick Save Qty+Price.</p>
      </section>}

      {active === 'livestock' && <section><h3>Livestock Listings</h3><form className='inlineForm' onSubmit={async e => { e.preventDefault(); await api.createLivestock({ ...livestockForm, farmer_id: Number(livestockForm.farmer_id), quantity: Number(livestockForm.quantity), unit_price: Number(livestockForm.unit_price) }); await load() }}>
        <input className='input' placeholder='Type' value={livestockForm.livestock_type} onChange={e => setLivestockForm({ ...livestockForm, livestock_type: e.target.value })} required />
        <input className='input' placeholder='Quantity' value={livestockForm.quantity} onChange={e => setLivestockForm({ ...livestockForm, quantity: e.target.value })} required />
        <input className='input' placeholder='Unit price' value={livestockForm.unit_price} onChange={e => setLivestockForm({ ...livestockForm, unit_price: e.target.value })} required />
        <input className='input' placeholder='Location' value={livestockForm.location} onChange={e => setLivestockForm({ ...livestockForm, location: e.target.value })} />
        <button className='btn btn-dark'>Create</button>
      </form>

      <form className='inlineForm' onSubmit={async e => {
        e.preventDefault();
        await api.updateLivestock(Number(livestockEdit.id), {
          farmer_id: Number(livestockEdit.farmer_id || 1),
          livestock_type: livestockEdit.livestock_type,
          quantity: Number(livestockEdit.quantity),
          unit_price: Number(livestockEdit.unit_price),
          location: livestockEdit.location,
          country: livestockEdit.country,
          status: livestockEdit.status
        });
        await load();
      }}>
        <input className='input' placeholder='Listing ID to edit' value={livestockEdit.id} onChange={e => setLivestockEdit({ ...livestockEdit, id: e.target.value })} required />
        <input className='input' placeholder='Type' value={livestockEdit.livestock_type} onChange={e => setLivestockEdit({ ...livestockEdit, livestock_type: e.target.value })} required />
        <input className='input' placeholder='Quantity' value={livestockEdit.quantity} onChange={e => setLivestockEdit({ ...livestockEdit, quantity: e.target.value })} required />
        <input className='input' placeholder='Unit price' value={livestockEdit.unit_price} onChange={e => setLivestockEdit({ ...livestockEdit, unit_price: e.target.value })} required />
        <input className='input' placeholder='Location' value={livestockEdit.location} onChange={e => setLivestockEdit({ ...livestockEdit, location: e.target.value })} />
        <button className='btn btn-dark'>Save Edit</button>
      </form>

      <form className='inlineForm' onSubmit={async e => {
        e.preventDefault();
        try {
          await api.patchLivestockPriceQty(Number(livestockQuickEdit.id), {
            quantity: Number(livestockQuickEdit.quantity),
            unit_price: Number(livestockQuickEdit.unit_price)
          });
          await load();
          alert('Livestock update approved by AI and saved.');
        } catch(err) {
          alert(err?.response?.data?.detail || 'Update denied/failed');
        }
      }}>
        <input className='input' placeholder='Quick edit ID' value={livestockQuickEdit.id} onChange={e => setLivestockQuickEdit({ ...livestockQuickEdit, id: e.target.value })} required />
        <input className='input' placeholder='New quantity' value={livestockQuickEdit.quantity} onChange={e => setLivestockQuickEdit({ ...livestockQuickEdit, quantity: e.target.value })} required />
        <input className='input' placeholder='New unit price' value={livestockQuickEdit.unit_price} onChange={e => setLivestockQuickEdit({ ...livestockQuickEdit, unit_price: e.target.value })} required />
        <button className='btn btn-dark'>Quick Save Qty+Price</button>
      </form>
      <DataTable columns={['id', 'livestock_type', 'quantity', 'unit_price', 'country', 'status']} rows={state.livestock} filterKey='livestock_type' onEdit={(r) => {
        setLivestockEdit({
          id: r.id,
          farmer_id: r.farmer_id || 1,
          livestock_type: r.livestock_type || '',
          quantity: r.quantity || '',
          unit_price: r.unit_price || '',
          location: r.location || '',
          country: r.country || 'GH',
          status: r.status || 'OPEN'
        })
        setLivestockQuickEdit({ id: r.id, quantity: r.quantity || '', unit_price: r.unit_price || '' })
        addRecentViewed(`Livestock #${r.id} ${r.livestock_type || ''}`)
      }} />
      <p style={{fontSize:'.85rem',color:'#475569'}}>Tip: click Edit on a row, change fields, then Save Edit or Quick Save Qty+Price.</p>
      </section>}

      {active === 'services' && <section><h3>Services</h3>
        <div className='three-col'>
          <article className='panel'><h4>Logistics Requests</h4><form className='list' onSubmit={async e => { e.preventDefault(); await api.createLogistics({ ...logisticsForm, requester_id: Number(logisticsForm.requester_id), weight_kg: Number(logisticsForm.weight_kg) }); await load() }}>
            <input className='input' placeholder='Pickup' value={logisticsForm.pickup_location} onChange={e => setLogisticsForm({ ...logisticsForm, pickup_location: e.target.value })} />
            <input className='input' placeholder='Dropoff' value={logisticsForm.dropoff_location} onChange={e => setLogisticsForm({ ...logisticsForm, dropoff_location: e.target.value })} />
            <input className='input' placeholder='Cargo type' value={logisticsForm.cargo_type} onChange={e => setLogisticsForm({ ...logisticsForm, cargo_type: e.target.value })} />
            <input className='input' placeholder='Weight kg' value={logisticsForm.weight_kg} onChange={e => setLogisticsForm({ ...logisticsForm, weight_kg: e.target.value })} />
            <button className='btn btn-dark'>Create Logistics</button>
          </form>
          <form className='list' onSubmit={async e => { e.preventDefault(); await api.updateLogistics(Number(logisticsEdit.id), { ...logisticsEdit, requester_id: Number(logisticsEdit.requester_id), weight_kg: Number(logisticsEdit.weight_kg) }); await load() }}>
            <input className='input' placeholder='ID to edit' value={logisticsEdit.id} onChange={e => setLogisticsEdit({ ...logisticsEdit, id: e.target.value })} required />
            <input className='input' placeholder='Pickup' value={logisticsEdit.pickup_location} onChange={e => setLogisticsEdit({ ...logisticsEdit, pickup_location: e.target.value })} />
            <input className='input' placeholder='Dropoff' value={logisticsEdit.dropoff_location} onChange={e => setLogisticsEdit({ ...logisticsEdit, dropoff_location: e.target.value })} />
            <button className='btn btn-dark'>Save Edit</button>
          </form>
          <DataTable columns={['id', 'pickup_location', 'dropoff_location', 'cargo_type', 'weight_kg', 'status']} rows={state.logistics} filterKey='pickup_location' /></article>
          <article className='panel'><h4>Equipment Rentals</h4><form className='list' onSubmit={async e => { e.preventDefault(); await api.createEquipment({ ...equipmentForm, requester_id: Number(equipmentForm.requester_id), duration_days: Number(equipmentForm.duration_days), budget: Number(equipmentForm.budget) }); await load() }}>
            <input className='input' placeholder='Equipment' value={equipmentForm.equipment_type} onChange={e => setEquipmentForm({ ...equipmentForm, equipment_type: e.target.value })} />
            <input className='input' placeholder='Duration days' value={equipmentForm.duration_days} onChange={e => setEquipmentForm({ ...equipmentForm, duration_days: e.target.value })} />
            <input className='input' placeholder='Location' value={equipmentForm.location} onChange={e => setEquipmentForm({ ...equipmentForm, location: e.target.value })} />
            <input className='input' placeholder='Budget' value={equipmentForm.budget} onChange={e => setEquipmentForm({ ...equipmentForm, budget: e.target.value })} />
            <button className='btn btn-dark'>Create Rental</button>
          </form>
          <form className='list' onSubmit={async e => { e.preventDefault(); await api.updateEquipment(Number(equipmentEdit.id), { ...equipmentEdit, requester_id: Number(equipmentEdit.requester_id), duration_days: Number(equipmentEdit.duration_days), budget: Number(equipmentEdit.budget) }); await load() }}>
            <input className='input' placeholder='ID to edit' value={equipmentEdit.id} onChange={e => setEquipmentEdit({ ...equipmentEdit, id: e.target.value })} required />
            <input className='input' placeholder='Equipment' value={equipmentEdit.equipment_type} onChange={e => setEquipmentEdit({ ...equipmentEdit, equipment_type: e.target.value })} />
            <input className='input' placeholder='Duration days' value={equipmentEdit.duration_days} onChange={e => setEquipmentEdit({ ...equipmentEdit, duration_days: e.target.value })} />
            <button className='btn btn-dark'>Save Edit</button>
          </form>
          <DataTable columns={['id', 'equipment_type', 'duration_days', 'location', 'budget', 'status']} rows={state.equipment} filterKey='equipment_type' /></article>
          <article className='panel'><h4>Storage Reservations</h4><form className='list' onSubmit={async e => { e.preventDefault(); await api.createStorage({ ...storageForm, requester_id: Number(storageForm.requester_id), quantity_kg: Number(storageForm.quantity_kg), duration_days: Number(storageForm.duration_days) }); await load() }}>
            <input className='input' placeholder='Storage type' value={storageForm.storage_type} onChange={e => setStorageForm({ ...storageForm, storage_type: e.target.value })} />
            <input className='input' placeholder='Qty kg' value={storageForm.quantity_kg} onChange={e => setStorageForm({ ...storageForm, quantity_kg: e.target.value })} />
            <input className='input' placeholder='Location' value={storageForm.location} onChange={e => setStorageForm({ ...storageForm, location: e.target.value })} />
            <input className='input' placeholder='Duration days' value={storageForm.duration_days} onChange={e => setStorageForm({ ...storageForm, duration_days: e.target.value })} />
            <button className='btn btn-dark'>Create Reservation</button>
          </form>
          <form className='list' onSubmit={async e => { e.preventDefault(); await api.updateStorage(Number(storageEdit.id), { ...storageEdit, requester_id: Number(storageEdit.requester_id), quantity_kg: Number(storageEdit.quantity_kg), duration_days: Number(storageEdit.duration_days) }); await load() }}>
            <input className='input' placeholder='ID to edit' value={storageEdit.id} onChange={e => setStorageEdit({ ...storageEdit, id: e.target.value })} required />
            <input className='input' placeholder='Storage type' value={storageEdit.storage_type} onChange={e => setStorageEdit({ ...storageEdit, storage_type: e.target.value })} />
            <input className='input' placeholder='Qty kg' value={storageEdit.quantity_kg} onChange={e => setStorageEdit({ ...storageEdit, quantity_kg: e.target.value })} />
            <button className='btn btn-dark'>Save Edit</button>
          </form>
          <DataTable columns={['id', 'storage_type', 'quantity_kg', 'location', 'duration_days', 'status']} rows={state.storage} filterKey='storage_type' /></article>
        </div>
      </section>}

      {active === 'payments' && <section><h3>Payments + Escrow</h3><form className='inlineForm' onSubmit={async e => { e.preventDefault(); await api.createPayment({ ...paymentForm, payer_id: Number(paymentForm.payer_id), payee_id: Number(paymentForm.payee_id), amount: Number(paymentForm.amount) }); await load() }}>
        <input className='input' placeholder='Payer ID' value={paymentForm.payer_id} onChange={e => setPaymentForm({ ...paymentForm, payer_id: e.target.value })} />
        <input className='input' placeholder='Payee ID' value={paymentForm.payee_id} onChange={e => setPaymentForm({ ...paymentForm, payee_id: e.target.value })} />
        <input className='input' placeholder='Amount' value={paymentForm.amount} onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
        <select className='input' value={paymentForm.country} onChange={e => setPaymentForm({ ...paymentForm, country: e.target.value, provider: paymentProviders[e.target.value][0] })}>{countries.map(c => <option key={c}>{c}</option>)}</select>
        <select className='input' value={paymentForm.provider} onChange={e => setPaymentForm({ ...paymentForm, provider: e.target.value })}>{paymentProviders[paymentForm.country].map(p => <option key={p}>{p}</option>)}</select>
        <label><input type='checkbox' checked={paymentForm.escrow_enabled} onChange={e => setPaymentForm({ ...paymentForm, escrow_enabled: e.target.checked })} /> Escrow</label>
        <button className='btn btn-dark'>Create Payment</button>
      </form>
      <form className='inlineForm' onSubmit={async e => { e.preventDefault(); await api.updatePayment(Number(paymentEdit.id), { ...paymentEdit, payer_id: Number(paymentEdit.payer_id), payee_id: Number(paymentEdit.payee_id), amount: Number(paymentEdit.amount) }); await load() }}>
        <input className='input' placeholder='Payment ID to edit' value={paymentEdit.id} onChange={e => setPaymentEdit({ ...paymentEdit, id: e.target.value })} required />
        <input className='input' placeholder='Amount' value={paymentEdit.amount} onChange={e => setPaymentEdit({ ...paymentEdit, amount: e.target.value })} />
        <select className='input' value={paymentEdit.country} onChange={e => setPaymentEdit({ ...paymentEdit, country: e.target.value, provider: paymentProviders[e.target.value][0] })}>{countries.map(c => <option key={c}>{c}</option>)}</select>
        <select className='input' value={paymentEdit.provider} onChange={e => setPaymentEdit({ ...paymentEdit, provider: e.target.value })}>{paymentProviders[paymentEdit.country].map(p => <option key={p}>{p}</option>)}</select>
        <button className='btn btn-dark'>Save Edit</button>
      </form>
      <DataTable columns={['id', 'payer_id', 'payee_id', 'amount', 'country', 'provider', 'escrow_enabled', 'status']} rows={state.payments} filterKey='provider' /></section>}

      {active === 'alerts' && <section><h3>Weather Alerts (GH • NG • BF)</h3>
        <div className='inlineForm' style={{marginBottom: 10}}>
          <select className='input' value={alertCountryFilter} onChange={e => setAlertCountryFilter(e.target.value)}>
            <option value='ALL'>All Countries</option>
            <option value='GH'>Ghana</option>
            <option value='NG'>Nigeria</option>
            <option value='BF'>Burkina Faso</option>
          </select>
          <button className='btn btn-dark' onClick={async () => { await api.syncWeather(); await load(); }}>Auto Sync 3 Countries</button>
        </div>

        <form className='inlineForm' onSubmit={async e => { e.preventDefault(); await api.createAlert({ ...alertForm, valid_until: alertForm.valid_until || null }); await load() }}>
          <select className='input' value={alertForm.country} onChange={e => setAlertForm({ ...alertForm, country: e.target.value, region: '' })}>{countries.map(c => <option key={c}>{c}</option>)}</select>
          <select className='input' value={alertForm.region} onChange={e => setAlertForm({ ...alertForm, region: e.target.value })}>
            <option value=''>Select Region</option>
            {(regionMap[alertForm.country] || []).map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <input className='input' placeholder='Alert type' value={alertForm.alert_type} onChange={e => setAlertForm({ ...alertForm, alert_type: e.target.value })} />
          <input className='input' placeholder='Message' value={alertForm.message} onChange={e => setAlertForm({ ...alertForm, message: e.target.value })} />
          <button className='btn btn-dark'>Create Alert</button>
        </form>

        <form className='inlineForm' onSubmit={async e => { e.preventDefault(); await api.updateAlert(Number(alertEdit.id), { ...alertEdit, valid_until: alertEdit.valid_until || null }); await load() }}>
          <input className='input' placeholder='Alert ID to edit' value={alertEdit.id} onChange={e => setAlertEdit({ ...alertEdit, id: e.target.value })} required />
          <select className='input' value={alertEdit.country} onChange={e => setAlertEdit({ ...alertEdit, country: e.target.value, region: '' })}>{countries.map(c => <option key={c}>{c}</option>)}</select>
          <select className='input' value={alertEdit.region} onChange={e => setAlertEdit({ ...alertEdit, region: e.target.value })}>
            <option value=''>Select Region</option>
            {(regionMap[alertEdit.country] || []).map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <input className='input' placeholder='Alert type' value={alertEdit.alert_type} onChange={e => setAlertEdit({ ...alertEdit, alert_type: e.target.value })} />
          <input className='input' placeholder='Message' value={alertEdit.message} onChange={e => setAlertEdit({ ...alertEdit, message: e.target.value })} />
          <button className='btn btn-dark'>Save Edit</button>
        </form>
        <DataTable columns={['id', 'country', 'region', 'severity', 'alert_type', 'message']} rows={state.alerts} filterKey='region' />
      </section>}

      {active === 'maps' && <section><h3>Map System (Google Maps) + Farm GPS Mapping</h3>
        <div className='inlineForm'>
          <select className='input' value={mapCountry} onChange={(e)=>setMapCountry(e.target.value)}>
            <option value='GH'>Ghana</option><option value='NG'>Nigeria</option><option value='BF'>Burkina Faso</option>
          </select>
          <button className='btn btn-dark' onClick={() => window.open('https://maps.google.com', '_blank')}>Open Google Maps</button>
        </div>
        <div className='panel'>
          {mapCountry === 'GH' && <iframe title='Ghana map' width='100%' height='320' style={{border:0}} loading='lazy' src='https://www.openstreetmap.org/export/embed.html?bbox=-3.5%2C4.5%2C1.5%2C11.5&layer=mapnik' />}
          {mapCountry === 'NG' && <iframe title='Nigeria map' width='100%' height='320' style={{border:0}} loading='lazy' src='https://www.openstreetmap.org/export/embed.html?bbox=2.5%2C4.0%2C15.5%2C14.5&layer=mapnik' />}
          {mapCountry === 'BF' && <iframe title='Burkina Faso map' width='100%' height='320' style={{border:0}} loading='lazy' src='https://www.openstreetmap.org/export/embed.html?bbox=-6.5%2C9.0%2C3.0%2C15.5&layer=mapnik' />}
          <p style={{fontSize:'.85rem', color:'#64748b'}}>Step 1: Open map. Step 2: Drop pin in Google Maps. Step 3: copy lat/lng below and save farm profile.</p>
        </div>

        <form className='inlineForm' onSubmit={async (e) => {
          e.preventDefault();
          await api.createPassport({
            ...farmMapForm,
            user_id: Number(farmMapForm.user_id),
            gps_lat: Number(farmMapForm.gps_lat),
            gps_lng: Number(farmMapForm.gps_lng),
            farm_size_hectares: Number(farmMapForm.farm_size_hectares)
          });
          await load();
          alert('Farm GPS mapping saved to database.');
        }}>
          <input className='input' placeholder='User ID' value={farmMapForm.user_id} onChange={(e)=>setFarmMapForm({...farmMapForm,user_id:e.target.value})} required />
          <input className='input' placeholder='GPS Lat' value={farmMapForm.gps_lat} onChange={(e)=>setFarmMapForm({...farmMapForm,gps_lat:e.target.value})} required />
          <input className='input' placeholder='GPS Lng' value={farmMapForm.gps_lng} onChange={(e)=>setFarmMapForm({...farmMapForm,gps_lng:e.target.value})} required />
          <input className='input' placeholder='Farm size (hectares)' value={farmMapForm.farm_size_hectares} onChange={(e)=>setFarmMapForm({...farmMapForm,farm_size_hectares:e.target.value})} required />
          <input className='input' placeholder='Farm photos URLs JSON array' value={farmMapForm.farm_photo_urls} onChange={(e)=>setFarmMapForm({...farmMapForm,farm_photo_urls:e.target.value})} />
          <button className='btn btn-dark'>Save Farm GPS</button>
        </form>
      </section>}

      {active === 'messaging' && <section><h3>Messaging (Firebase Cloud Messaging)</h3>
        <form className='inlineForm' onSubmit={async e => { e.preventDefault(); await api.registerDeviceToken({ user_id: 1, platform: 'web', token: fcmToken }); setFcmToken(''); await load(); }}>
          <input className='input' placeholder='FCM device token' value={fcmToken} onChange={(e)=>setFcmToken(e.target.value)} required />
          <button className='btn btn-dark'>Register Device Token</button>
        </form>
        <DataTable columns={['id','user_id','platform','token','created_at']} rows={state.deviceTokens} filterKey='platform' />
      </section>}

      {active === 'ai-disease' && <section><h3>AI Disease Analyzer</h3>
        <form className='inlineForm' onSubmit={async e => {
          e.preventDefault();
          try {
            if (!diseaseForm.target) { alert('Please select crop/animal type first.'); return }
            if (!diseaseForm.image_url) { alert('Please upload an image or provide an image URL.'); return }
            const r = await api.analyzeDisease({ user_id: Number(diseaseForm.user_id), crop_type: diseaseForm.target, image_url: diseaseForm.image_url });
            alert(`Diagnosis: ${r.diagnosis} | Confidence: ${Math.round((r.confidence||0)*100)}%`);
            await load();
          } catch (err) {
            alert(`Analyze failed: ${errMsg(err)}`)
          }
        }}>
          <input className='input' placeholder='User ID' value={diseaseForm.user_id} onChange={(e)=>setDiseaseForm({...diseaseForm,user_id:e.target.value})} />
          <select className='input' value={diseaseForm.category} onChange={(e)=>setDiseaseForm({...diseaseForm,category:e.target.value,target:''})}>
            <option value='crop'>Crop Disease</option>
            <option value='animal'>Animal Disease</option>
          </select>
          <select className='input' value={diseaseForm.target} onChange={(e)=>setDiseaseForm({...diseaseForm,target:e.target.value})} required>
            <option value=''>Select</option>
            {(diseaseForm.category === 'crop' ? cropOptions : animalOptions).map(x => <option key={x} value={x}>{x}</option>)}
          </select>
          <input className='input' placeholder='Image URL (optional)' value={diseaseForm.image_url.startsWith('uploaded://') ? '' : diseaseForm.image_url} onChange={(e)=>setDiseaseForm({...diseaseForm,image_url:e.target.value})} />
          <input className='input' type='file' accept='image/*' onChange={(e)=>{
            const f = e.target.files?.[0]
            if (!f) return
            setDiseaseImageFileName(f.name)
            setDiseaseForm(prev => ({ ...prev, image_url: `uploaded://${f.name}` }))
            const reader = new FileReader()
            reader.onload = () => setDiseaseImagePreview(String(reader.result || ''))
            reader.readAsDataURL(f)
          }} />
          <button className='btn btn-dark'>Analyze</button>
        </form>
        {diseaseImageFileName && <p style={{fontSize:'.82rem',color:'#475569'}}>Uploaded: {diseaseImageFileName}</p>}
        {diseaseImagePreview && <img src={diseaseImagePreview} alt='Disease scan preview' style={{maxWidth:260,borderRadius:8,border:'1px solid #e2e8f0',marginBottom:8}} />}
        <DataTable columns={['id','user_id','crop_type','image_url','result','created_at']} rows={state.diseaseScans} filterKey='crop_type' />
      </section>}

      {active === 'government' && <section><h3>Government Integration</h3>
        <article className='panel'>
          <h4>Official Programs & Subsidies (auto-check)</h4>
          <DataTable columns={['country','agency','headline','status','source_url','last_checked_utc']} rows={state.govPrograms} filterKey='agency' />
          <p style={{fontSize:'.82rem', color:'#64748b'}}>Best-effort direct checks from official ministry websites. Open source links for complete current program details.</p>
        </article>

        <div className='two-col' style={{marginTop:10}}>
          <article className='panel'>
            <h4>Distribute Subsidy</h4>
            <form className='list' onSubmit={async e => { e.preventDefault(); await api.govDistributeSubsidy({ ...govSubsidyForm, farmer_user_id: Number(govSubsidyForm.farmer_user_id), amount: Number(govSubsidyForm.amount) }); alert('Subsidy recorded successfully'); await load(); }}>
              <select className='input' value={govSubsidyForm.country} onChange={(e)=>setGovSubsidyForm({...govSubsidyForm,country:e.target.value})}><option value='GH'>Ghana</option><option value='NG'>Nigeria</option><option value='BF'>Burkina Faso</option></select>
              <input className='input' placeholder='Agency' value={govSubsidyForm.agency} onChange={(e)=>setGovSubsidyForm({...govSubsidyForm,agency:e.target.value})} />
              <input className='input' placeholder='Farmer User ID' value={govSubsidyForm.farmer_user_id} onChange={(e)=>setGovSubsidyForm({...govSubsidyForm,farmer_user_id:e.target.value})} />
              <input className='input' placeholder='Amount' value={govSubsidyForm.amount} onChange={(e)=>setGovSubsidyForm({...govSubsidyForm,amount:e.target.value})} />
              <button className='btn btn-dark'>Record Subsidy</button>
            </form>
          </article>

          <article className='panel'>
            <h4>Communicate with Farmers</h4>
            <form className='list' onSubmit={async e => { e.preventDefault(); await api.govCommunicate(govMsgForm); alert('Government message queued'); }}>
              <select className='input' value={govMsgForm.country} onChange={(e)=>setGovMsgForm({...govMsgForm,country:e.target.value})}><option value='GH'>Ghana</option><option value='NG'>Nigeria</option><option value='BF'>Burkina Faso</option></select>
              <input className='input' placeholder='Target (farmers/coops/all)' value={govMsgForm.target} onChange={(e)=>setGovMsgForm({...govMsgForm,target:e.target.value})} />
              <input className='input' placeholder='Message text' value={govMsgForm.text} onChange={(e)=>setGovMsgForm({...govMsgForm,text:e.target.value})} />
              <button className='btn btn-dark'>Send Notice</button>
            </form>
          </article>
        </div>
      </section>}

      {active === 'contracts' && <section><h3>Cross-Border Contracts (MVP)</h3><form className='inlineForm' onSubmit={async e => { e.preventDefault(); await api.createContract({ ...contractForm, quantity: Number(contractForm.quantity), price: Number(contractForm.price), delivery_date: new Date(contractForm.delivery_date).toISOString() }); await load() }}>
        <select className='input' value={contractForm.origin_country} onChange={e => setContractForm({ ...contractForm, origin_country: e.target.value })}>{countries.map(c => <option key={c}>{c}</option>)}</select>
        <select className='input' value={contractForm.destination_country} onChange={e => setContractForm({ ...contractForm, destination_country: e.target.value })}>{countries.map(c => <option key={c}>{c}</option>)}</select>
        <input className='input' placeholder='Commodity' value={contractForm.commodity} onChange={e => setContractForm({ ...contractForm, commodity: e.target.value })} />
        <input className='input' placeholder='Quantity' value={contractForm.quantity} onChange={e => setContractForm({ ...contractForm, quantity: e.target.value })} />
        <input className='input' placeholder='Price' value={contractForm.price} onChange={e => setContractForm({ ...contractForm, price: e.target.value })} />
        <input className='input' type='date' value={contractForm.delivery_date} onChange={e => setContractForm({ ...contractForm, delivery_date: e.target.value })} />
        <input className='input' placeholder='Payment terms' value={contractForm.payment_terms} onChange={e => setContractForm({ ...contractForm, payment_terms: e.target.value })} />
        <button className='btn btn-dark'>Create Contract</button>
      </form>
      <form className='inlineForm' onSubmit={async e => { e.preventDefault(); await api.updateContract(Number(contractEdit.id), { ...contractEdit, quantity: Number(contractEdit.quantity), price: Number(contractEdit.price), delivery_date: new Date(contractEdit.delivery_date).toISOString() }); await load() }}>
        <input className='input' placeholder='Contract ID to edit' value={contractEdit.id} onChange={e => setContractEdit({ ...contractEdit, id: e.target.value })} required />
        <input className='input' placeholder='Commodity' value={contractEdit.commodity} onChange={e => setContractEdit({ ...contractEdit, commodity: e.target.value })} />
        <input className='input' placeholder='Quantity' value={contractEdit.quantity} onChange={e => setContractEdit({ ...contractEdit, quantity: e.target.value })} />
        <input className='input' placeholder='Price' value={contractEdit.price} onChange={e => setContractEdit({ ...contractEdit, price: e.target.value })} />
        <button className='btn btn-dark'>Save Edit</button>
      </form>
      <DataTable columns={['id', 'origin_country', 'destination_country', 'commodity', 'quantity', 'price', 'status']} rows={state.contracts} filterKey='commodity' /></section>}

      {active === 'admin' && ((me?.role || '').toLowerCase() === 'admin') && <section>
        <h2>Admin Dashboard (Admin Only)</h2>
        <div className='kpi-grid'>
          <article className='kpi-card'><p>User management</p><strong>{state.users.length}</strong></article>
          <article className='kpi-card'><p>Crop marketplace monitoring</p><strong>{state.listings.length}</strong></article>
          <article className='kpi-card'><p>Payment tracking</p><strong>{state.payments.length}</strong></article>
          <article className='kpi-card'><p>Logistics monitoring</p><strong>{state.logistics.length}</strong></article>
          <article className='kpi-card'><p>Disputes</p><strong>{state.disputes.length}</strong></article>
          <article className='kpi-card'><p>Fraud flags</p><strong>{state.fraudFlags.length}</strong></article>
        </div>

        <article className='panel'>
          <h3>User Management</h3>
          <DataTable columns={['id','full_name','phone','country','region','role']} rows={state.users} filterKey='full_name' />
        </article>

        <div className='two-col'>
          <article className='panel'>
            <h3>Dispute Resolution (Denied Changes)</h3>
            <DataTable columns={['id','module','record_id','decision','reason','created_at']} rows={state.disputes} filterKey='module' />
          </article>
          <article className='panel'>
            <h3>Fraud Detection (High-Value Payments)</h3>
            <DataTable columns={['id','payer_id','payee_id','amount','country','provider','status']} rows={state.fraudFlags} filterKey='provider' />
          </article>
        </div>
      </section>}

    </main>
  </div>
}
