import { useEffect, useMemo, useRef, useState } from 'react'
import * as api from './services/api'

const errMsg = (e) => e?.response?.data?.detail || e?.message || 'Request failed'
const normalizePhone = (v='') => {
  const raw = String(v || '').trim()
  if (!raw) return ''
  const digits = raw.replace(/[^\d+]/g, '')
  if (digits.startsWith('+')) return digits
  return `+${digits}`
}
const normalizeIdentifier = (v='') => {
  const s = String(v || '').trim()
  if (!s) return ''
  if (s.includes('@')) return s.toLowerCase()
  return normalizePhone(s)
}

const countries = ['GH', 'NG', 'BF']
const countryLabels = { GH: 'Ghana (GH)', NG: 'Nigeria (NG)', BF: 'Burkina Faso (BF)' }
const countryLabelsZh = { GH: '加纳 (GH)', NG: '尼日利亚 (NG)', BF: '布基纳法索 (BF)' }
const mapBoundsByCountry = {
  GH: { minLng: -3.5, minLat: 4.5, maxLng: 1.5, maxLat: 11.5, iframe: 'https://www.openstreetmap.org/export/embed.html?bbox=-3.5%2C4.5%2C1.5%2C11.5&layer=mapnik' },
  NG: { minLng: 2.5, minLat: 4.0, maxLng: 15.5, maxLat: 14.5, iframe: 'https://www.openstreetmap.org/export/embed.html?bbox=2.5%2C4.0%2C15.5%2C14.5&layer=mapnik' },
  BF: { minLng: -6.5, minLat: 9.0, maxLng: 3.0, maxLat: 15.5, iframe: 'https://www.openstreetmap.org/export/embed.html?bbox=-6.5%2C9.0%2C3.0%2C15.5&layer=mapnik' }
}

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

const weatherConditionZh = {
  'Partly cloudy': '局部多云',
  'Cloudy': '多云',
  'Sunny': '晴朗',
  'Humid': '潮湿',
  'Hot': '炎热',
  'Clear': '晴天',
  'Warm': '温暖'
}

const newsTitleFr = {
  'West Africa input prices ease as supply chains stabilize': 'Les prix des intrants en Afrique de l’Ouest baissent avec la stabilisation des chaînes d’approvisionnement',
  'Moisture outlook improves for rice and maize belts': 'Les perspectives d’humidité s’améliorent pour les zones de riz et de maïs',
  'Regional livestock demand remains strong ahead of market week': 'La demande régionale en bétail reste forte avant la semaine de marché'
}

const newsTitleZh = {
  'West Africa input prices ease as supply chains stabilize': '随着供应链稳定，西非农业投入品价格回落',
  'Moisture outlook improves for rice and maize belts': '稻米和玉米主产带的湿度前景改善',
  'Regional livestock demand remains strong ahead of market week': '市场周前区域畜牧需求仍然强劲',
  'Official Program Updates': '官方项目更新',
  'Program Announcements': '项目公告',
  'Actualités du secteur': '行业动态'
}

const zhMap = {
  'home': '首页', 'dashboard': '仪表盘', 'onboarding': '账户', 'products': '产品', 'livestock': '牲畜', 'services': '服务', 'payments': '支付', 'alerts': '预警', 'maps': '地图', 'messaging': '消息', 'World Chat': '世界聊天', 'FarmSavior Community': 'FarmSavior 社区', 'AI Disease Analyzer': 'AI 病害分析', 'AI Plant Identifier': 'AI 植物识别', 'AI Insect & Pest Identifier': 'AI 昆虫与害虫识别', 'Government Programs': '政府项目', 'contracts': '合同', 'admin': '管理员',
  'Hide': '隐藏', 'Show': '显示', 'Open': '打开', 'Start': '开始', 'Login': '登录', 'Sign In': '登录', 'Create Account': '创建账户', 'Cancel': '取消', 'Currency': '货币', 'Payment methods': '支付方式', 'Products': '产品', 'logout': '退出登录',
  'No messages yet.': '暂无消息。', 'Open Chat': '打开聊天', 'Open World Chat': '打开全球聊天', 'Go to My Account': '前往我的账户', 'Popular Actions': '热门操作', 'Global World Chat': '全球世界聊天', 'Map System (Google Maps) + Farm GPS Mapping': '地图系统（Google 地图）+ 农场 GPS 标注',
  'Government Programs & Subsidies (Ghana • Nigeria • Burkina Faso)': '政府项目与补贴（加纳 • 尼日利亚 • 布基纳法索）', 'Programs Page': '项目页面', 'Current Export/Import Statistics (Top 10 + Volumes)': '当前进出口统计（前10 + 总量）', 'Top 10 Exporters': '前10大出口国', 'Top 10 Importers': '前10大进口国',
  'Program details temporarily unavailable. Open source page.': '项目详情暂时不可用。请打开来源页面。', 'unavailable': '不可用', 'Official program update': '官方项目更新',
  'Please sign in or create an account to continue.': '请登录或创建账户以继续。', 'Sign in required': '需要登录', 'Open Login Popup': '打开登录弹窗',
  'Phone': '手机号', 'Phone or Email': '手机号或邮箱', 'Password': '密码', 'OTP Code': '验证码', 'Verify OTP': '验证 OTP',
  'My Account': '我的账户', 'My Verification Status': '我的认证状态', 'Save Profile': '保存资料', 'Change Password': '修改密码',
  'Main Interface': '主界面', 'Main App Homepage': '主应用首页', 'Public Homepage': '公开首页',
  'Goats': '山羊', 'Sheep': '绵羊', 'Day-old Chicks': '雏鸡', 'Cows': '奶牛', 'Cashew': '腰果', 'Mango': '芒果', 'Coconuts': '椰子', 'Coffee': '咖啡', 'Cocoa': '可可', 'Rice': '大米', 'Maize': '玉米', 'Wheat': '小麦', 'Soybeans': '大豆', 'Poultry': '家禽', 'Sheep & Goats': '羊与山羊', 'Cattle': '牛',
  'Tractor hire (4WD)': '四驱拖拉机租赁', 'Combine harvester rental': '联合收割机租赁', 'Cold room storage': '冷库储存', 'Long-haul truck logistics': '长途卡车物流', 'Farm spraying service': '农场喷洒服务', 'Irrigation setup service': '灌溉安装服务', 'Feed supply delivery': '饲料配送', 'Warehouse monthly leasing': '仓库月租', 'Farm consultancy': '农业咨询', 'Ram/Buck/Bull rentals': '公羊/种公山羊/公牛租赁',
  'Access Portal': '访问入口', 'Download App to Phone': '下载到手机', 'Spot Trading (Ghana • Nigeria • Burkina Faso • World Avg)': '现货交易（加纳 • 尼日利亚 • 布基纳法索 • 全球均值）', 'Legal & Safety Notice': '法律与安全声明', 'High Demand Products': '高需求产品', 'High Demand Services': '高需求服务',
  'FarmSavior Marketplace Live': 'FarmSavior 市场实时',
  'High-demand products and services across Ghana, Nigeria, and Burkina Faso. Browse freely. To contact providers or use tools, sign up/sign in.': '覆盖加纳、尼日利亚和布基纳法索的高需求产品与服务。可自由浏览；联系服务商或使用工具请注册/登录。',
  'Safety notice: Content and AI outputs are guidance only. Verify locally with qualified agronomy/veterinary professionals before acting.': '安全提示：内容和AI结果仅供参考。行动前请在本地与合格的农学/兽医专业人士核实。',
  'You are signed in.': '你已登录。', 'Log out': '退出登录',
  'Export Briefing (PDF)': '导出简报（PDF）', 'Source': '来源', 'FarmSavior market feed': 'FarmSavior 市场数据',
  'Amount': '金额', 'Filter currency (e.g., GHS, NGN, EUR)': '筛选货币（例如 GHS、NGN、EUR）', 'All': '全部', 'Rates source': '汇率来源', 'Last updated': '最后更新', 'No rates available right now.': '当前暂无汇率数据。',
  'Value': '数值', 'Please choose units of the same type (length/area/weight).': '请选择同类型单位（长度/面积/重量）。', 'Includes common farming units: meters, feet, kilometers, hectares, acres, grams, kilograms, pounds, and tons.': '包含常见农业单位：米、英尺、公里、公顷、英亩、克、千克、磅和吨。',
  'Services': '服务', 'AI Disease': 'AI 病害', 'Plant ID': '植物识别', 'Pest ID': '害虫识别',
  'Legal/Safety: AI and market outputs are informational. Always verify diagnosis, dosage, legal approvals, and withdrawal periods with local professionals before action.': '法律/安全：AI与市场输出仅供参考。采取行动前，请与当地专业人士核实诊断、剂量、合规批准及停药期。',
  'Search products, livestock, services…': '搜索产品、牲畜、服务…',
  'No community posts yet.': '暂无社区帖子。',
  'Image credit: source / Unsplash': '图片来源：source / Unsplash',
  'Sources and image credits are shown on each story.': '每条资讯都显示来源与图片署名。',
  'Forecast': '预报',
  'forecast': '预报',
  'Update forecast': '更新预报',
  'Weather forecast': '天气预报',
  'Official Program Updates': '官方项目更新',
  'Program Announcements': '项目公告',
  '7d': '7天',
  '30d': '30天'
}

const polygonAreaHectares = (points = []) => {
  if (!points || points.length < 3) return 0
  const meanLat = points.reduce((s, p) => s + Number(p.lat || 0), 0) / points.length
  const mPerDegLat = 111320
  const mPerDegLng = 111320 * Math.cos((meanLat * Math.PI) / 180)
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const ax = Number(a.lng) * mPerDegLng
    const ay = Number(a.lat) * mPerDegLat
    const bx = Number(b.lng) * mPerDegLng
    const by = Number(b.lat) * mPerDegLat
    sum += (ax * by) - (bx * ay)
  }
  const sqm = Math.abs(sum) / 2
  return sqm / 10000
}

const polygonCentroid = (points = []) => {
  if (!points.length) return null
  const lat = points.reduce((s, p) => s + Number(p.lat || 0), 0) / points.length
  const lng = points.reduce((s, p) => s + Number(p.lng || 0), 0) / points.length
  return { lat, lng }
}

const featuredWeatherSeed = [
  { city: 'Accra', country: 'GH', condition: 'Partly cloudy', temperature_c: 29, humidity_pct: 74, rainfall_mm: 0.8 },
  { city: 'Kpando (Volta Region)', country: 'GH', condition: 'Cloudy', temperature_c: 27, humidity_pct: 79, rainfall_mm: 1.2 },
  { city: 'Tamale', country: 'GH', condition: 'Sunny', temperature_c: 33, humidity_pct: 55, rainfall_mm: 0.0 },
  { city: 'Lagos', country: 'NG', condition: 'Humid', temperature_c: 30, humidity_pct: 81, rainfall_mm: 1.5 },
  { city: 'Abuja', country: 'NG', condition: 'Cloudy', temperature_c: 28, humidity_pct: 67, rainfall_mm: 0.6 },
  { city: 'Kano', country: 'NG', condition: 'Sunny', temperature_c: 35, humidity_pct: 42, rainfall_mm: 0.0 },
  { city: 'Ouagadougou', country: 'BF', condition: 'Hot', temperature_c: 34, humidity_pct: 38, rainfall_mm: 0.0 },
  { city: 'Bobo-Dioulasso', country: 'BF', condition: 'Clear', temperature_c: 32, humidity_pct: 46, rainfall_mm: 0.0 },
  { city: 'Koudougou', country: 'BF', condition: 'Warm', temperature_c: 31, humidity_pct: 49, rainfall_mm: 0.2 }
]

const featuredNewsSeed = [
  { title: 'Climate-smart farming adoption grows across West Africa', url: 'https://www.fao.org', source: 'FAO News', published: '', image_url: 'https://images.unsplash.com/photo-1464226184884-fa280b87c399?auto=format&fit=crop&w=1200&q=80', image_credit: 'Unsplash / FAO' },
  { title: 'Smallholder market access improves with digital logistics', url: 'https://www.cgiar.org', source: 'CGIAR', published: '', image_url: 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=1200&q=80', image_credit: 'Unsplash / CGIAR' },
  { title: 'Agri-finance innovations helping rural producers scale', url: 'https://www.worldbank.org', source: 'World Bank Agriculture', published: '', image_url: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=80', image_credit: 'Unsplash / World Bank' }
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

const isUserImage = (v) => String(v || '').startsWith('data:image/')

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
  const authPrompt = searchParams.get('auth') || ''
  const initialSection = searchParams.get('go') || 'home'
  const [token, setToken] = useState(localStorage.getItem('farmsavior_token'))
  const [authMode, setAuthMode] = useState('login')
  const [portalType, setPortalType] = useState('main')
  const [uiCountry, setUiCountry] = useState(() => localStorage.getItem('farmsavior_ui_country') || 'GH')
  const [uiLang, setUiLang] = useState(() => localStorage.getItem('farmsavior_ui_lang') || 'en')
  const [phoneForOtp, setPhoneForOtp] = useState('')
  const [authMsg, setAuthMsg] = useState('')
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [pendingFeatureLabel, setPendingFeatureLabel] = useState('')
  const [active, setActive] = useState(initialSection)
  const [homeQuery, setHomeQuery] = useState('')
  const [publicQuery, setPublicQuery] = useState('')
  const [recentSearches, setRecentSearches] = useState([])
  const [recentViewed, setRecentViewed] = useState([])
  const [worldChat, setWorldChat] = useState([])
  const [worldChatText, setWorldChatText] = useState('')
  const [worldChatMsg, setWorldChatMsg] = useState('')
  const [worldChatQueue, setWorldChatQueue] = useState([])

  const [communityProfile, setCommunityProfile] = useState({ username: '', avatar_url: '', cover_image_url: '', bio: '', farm_life: '', interests: 'farming,gardening', visibility: 'PUBLIC' })
  const [communityPosts, setCommunityPosts] = useState([])
  const [communityFeedMode, setCommunityFeedMode] = useState('for-you')
  const [communityPostForm, setCommunityPostForm] = useState({ text: '', media_url: '', media_type: 'TEXT', tags: '' })
  const [communityCommentText, setCommunityCommentText] = useState({})
  const [communityComments, setCommunityComments] = useState({})

  const [state, setState] = useState({ metrics: {}, users: [], listings: [], livestock: [], logistics: [], equipment: [], storage: [], payments: [], alerts: [], contracts: [], idv: [], passports: [], verificationApps: [], approvedAccounts: [], deviceTokens: [], diseaseScans: [], disputes: [], fraudFlags: [], news: [], publicWeather: [], govPrograms: [], spotTrading: [], spotHistory: [], tradeExportStats: [], livestockPlans: [] })
  const [me, setMe] = useState(null)
  const lastTrackRef = useRef('')

  const [signup, setSignup] = useState({ full_name: '', signup_method: 'phone', phone: '', email: '', country: 'GH', region: '', user_type: 'Farmer', password: '', accept_terms: true, accept_privacy: true, consent_analytics: true, consent_personalization: true, consent_marketing: false, consent_aggregated_insights: true })
  const [login, setLogin] = useState({ identifier: '', password: '' })
  const [otp, setOtp] = useState({ destination: '', code: '' })

  const [idForm, setIdForm] = useState({ user_id: 1, id_type: 'GhanaCard', id_number: '', id_photo_url: '', id_front_photo_url: '', id_back_photo_url: '', facial_verification_flag: false })
  const [accountForm, setAccountForm] = useState({ full_name: '', region: '' })
  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '' })
  const [deleteAccountForm, setDeleteAccountForm] = useState({ current_password: '' })
  const [myIdVerification, setMyIdVerification] = useState({ application: null, review: null })
  const [myIdForm, setMyIdForm] = useState({ id_type: 'GhanaCard', id_number: '', id_photo_url: '', id_front_photo_url: '', id_back_photo_url: '', facial_verification_flag: false })
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
  const [mapPolygonPoints, setMapPolygonPoints] = useState([])
  const [mapPointInput, setMapPointInput] = useState('')
  const [expandedWeatherCountry, setExpandedWeatherCountry] = useState('GH')
  const [showHighDemandProducts, setShowHighDemandProducts] = useState(false)
  const [showHighDemandServices, setShowHighDemandServices] = useState(false)
  const [expandedSpotCommodity, setExpandedSpotCommodity] = useState('')
  const [expandedTradeCommodity, setExpandedTradeCommodity] = useState('')
  const [expandedTradeSections, setExpandedTradeSections] = useState({})
  const [expandedLivestockPlan, setExpandedLivestockPlan] = useState('')
  const [fxBase, setFxBase] = useState('USD')
  const [fxAmount, setFxAmount] = useState('1')
  const [fxRates, setFxRates] = useState({})
  const [fxUpdatedAt, setFxUpdatedAt] = useState('')
  const [fxQuery, setFxQuery] = useState('')

  const [unitValue, setUnitValue] = useState('1')
  const [unitFrom, setUnitFrom] = useState('ha')
  const [unitTo, setUnitTo] = useState('ac')
  const [showCurrencyConverter, setShowCurrencyConverter] = useState(false)
  const [showUnitConverter, setShowUnitConverter] = useState(false)
  const [showSplash, setShowSplash] = useState(true)
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false)

  const urlLang = (() => {
    try { return new URLSearchParams(window.location.search).get('lang') || '' } catch { return '' }
  })()
  const isZh = uiLang === 'zh' || uiLang === '中文' || String(urlLang).toLowerCase() === 'zh'
  const isFr = uiLang === 'fr' || String(urlLang).toLowerCase() === 'fr'

  const t = (en, fr, zh) => {
    if (isFr) return fr
    if (isZh) return zh || zhMap[en] || en
    return en
  }
  const displayProductName = (name) => (uiLang === 'fr' ? (productNameFr[name] || name) : (uiLang === 'zh' ? (zhMap[name] || name) : name))
  const displayServiceName = (name) => (uiLang === 'fr' ? (serviceNameFr[name] || name) : (uiLang === 'zh' ? (zhMap[name] || name) : name))
  const displayWeatherCondition = (condition) => {
    if (uiLang === 'zh') return weatherConditionZh[condition] || condition
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
  const displayNewsTitle = (title) => {
    if (uiLang === 'fr') return newsTitleFr[title] || title
    if (uiLang === 'zh') return newsTitleZh[title] || zhMap[title] || '农业新闻更新'
    return title
  }
  const displayCountryLabel = (code) => (uiLang === 'zh' ? (countryLabelsZh[code] || countryLabels[code] || code) : (countryLabels[code] || code))
  const displayCommodityName = (name) => {
    if (uiLang !== 'zh') return name
    const raw = String(name || '')
    const key = raw.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    const byKey = {
      'poultry': '家禽',
      'sheep goats': '羊与山羊',
      'sheep & goats': '羊与山羊',
      'cattle': '牛',
      'rice': '大米',
      'maize': '玉米',
      'wheat': '小麦',
      'soybeans': '大豆',
      'cocoa': '可可'
    }
    return zhMap[raw] || byKey[key] || raw
  }
  const displayPlanName = (name) => {
    if (uiLang !== 'zh') return name
    return String(name || '')
      .replace('Sheep & Goats', '羊与山羊')
      .replace('Starter', '入门版')
      .replace('Pro', '专业版')
      .replace('Enterprise', '企业版')
  }
  const displayFeature = (f) => {
    if (uiLang !== 'zh') return f
    const map = {
      'Basic records': '基础记录',
      'Health logs': '健康日志',
      'Breeding groups': '繁育分组',
      'Performance insights': '绩效洞察',
      'Multi-farm': '多农场',
      'Advanced analytics': '高级分析'
    }
    return map[f] || f
  }

  useEffect(() => {
    localStorage.setItem('farmsavior_ui_lang', uiLang)
  }, [uiLang])

  useEffect(() => {
    const id = setTimeout(() => setShowSplash(false), 700)
    const onOnline = () => setIsOffline(false)
    const onOffline = () => setIsOffline(true)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      clearTimeout(id)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('farmsavior_ui_country', uiCountry)
  }, [uiCountry])

  const [fcmToken, setFcmToken] = useState('')
  const [diseaseForm, setDiseaseForm] = useState({ user_id: 1, category: 'crop', target: '', image_url: '', context_note: '' })
  const [diseaseImageFileName, setDiseaseImageFileName] = useState('')
  const [diseaseImagePreview, setDiseaseImagePreview] = useState('')
  const [plantIdForm, setPlantIdForm] = useState({ user_id: 1, image_url: '', file_name: '', context_hint: '', target_livestock: 'goats' })
  const [plantIdPreview, setPlantIdPreview] = useState('')
  const [plantIdResult, setPlantIdResult] = useState(null)
  const [pestIdForm, setPestIdForm] = useState({ user_id: 1, crop_type: 'maize', image_url: '', file_name: '', context_hint: '' })
  const [pestIdPreview, setPestIdPreview] = useState('')
  const [pestIdResult, setPestIdResult] = useState(null)
  const [farmMapForm, setFarmMapForm] = useState({ user_id: 1, gps_lat: '', gps_lng: '', farm_size_hectares: '', crop_types: '[]', livestock_numbers: '{}', farm_photo_urls: '[]', harvest_records_notes: '' })
  const [govSubsidyForm, setGovSubsidyForm] = useState({ country: 'GH', agency: 'MOFA', farmer_user_id: 1, amount: '' })
  const [govMsgForm, setGovMsgForm] = useState({ country: 'GH', target: 'farmers', text: '' })
  const [showGovAdminTools, setShowGovAdminTools] = useState(false)

  const load = async () => {
    const meRes = await api.fetchMe().catch(() => null)
    setMe(meRes)
    if (meRes) {
      setAccountForm({ full_name: meRes.full_name || '', region: meRes.region || '' })
      setIdForm(prev => ({ ...prev, user_id: meRes.id || prev.user_id }))
      const mine = await api.fetchMyIdVerification().catch(() => ({ application: null, review: null }))
      setMyIdVerification(mine || { application: null, review: null })
      if (mine?.application) {
        setMyIdForm({
          id_type: mine.application.id_type || 'GhanaCard',
          id_number: mine.application.id_number || '',
          id_photo_url: mine.application.id_photo_url || '',
          id_front_photo_url: mine.application.id_front_photo_url || '',
          id_back_photo_url: mine.application.id_back_photo_url || '',
          facial_verification_flag: !!mine.application.facial_verification_flag
        })
      }
    }
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

  const loadWorldChat = async () => {
    const rows = await api.fetchWorldChatMessages(500).catch(() => [])
    setWorldChat(rows || [])
  }

  const loadWorldChatQueue = async () => {
    if ((me?.role || '').toLowerCase() !== 'admin') return
    const rows = await api.fetchWorldChatModerationQueue(120).catch(() => [])
    setWorldChatQueue(rows || [])
  }

  const loadCommunity = async () => {
    const [p, posts] = await Promise.all([
      api.fetchCommunityProfileMe().catch(() => null),
      api.fetchCommunityPosts(80).catch(() => [])
    ])
    if (p) setCommunityProfile(p)
    setCommunityPosts(posts || [])
  }

  useEffect(() => { if (token) load().catch(console.error) }, [token, alertCountryFilter])

  useEffect(() => {
    if (authPrompt === 'login' && !token) {
      setAuthMode('login')
      setAuthMsg('Please sign in or create an account to continue.')
      setShowAuthModal(true)
    }
    if (token) setShowAuthModal(false)
  }, [authPrompt, token])

  useEffect(() => {
    loadWorldChat().catch(() => {})
    const id = setInterval(() => { loadWorldChat().catch(() => {}) }, 5000)
    return () => clearInterval(id)
  }, [token])

  useEffect(() => {
    if (!token) return
    if ((me?.role || '').toLowerCase() !== 'admin') return
    loadWorldChatQueue().catch(() => {})
    const id = setInterval(() => { loadWorldChatQueue().catch(() => {}) }, 8000)
    return () => clearInterval(id)
  }, [token, me?.role])

  useEffect(() => {
    if (!token) return
    loadCommunity().catch(() => {})
    const id = setInterval(() => { loadCommunity().catch(() => {}) }, 7000)
    return () => clearInterval(id)
  }, [token])

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

  const handleProtectedAction = (section, label = '') => {
    if (token) {
      goToAppSection(section)
      return
    }
    setPendingFeatureLabel(label || section)
    setAuthMode('login')
    setShowAuthModal(true)
  }

  const addBoundaryPoint = (lat, lng) => {
    const point = { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) }
    setMapPolygonPoints(prev => [...prev, point])
    setFarmMapForm(prev => ({ ...prev, gps_lat: `${point.lat}`, gps_lng: `${point.lng}` }))
    setMapPointInput(`${point.lat}, ${point.lng}`)
  }

  const onMapOverlayClick = (e) => {
    const bounds = mapBoundsByCountry[mapCountry]
    if (!bounds) return
    const rect = e.currentTarget.getBoundingClientRect()
    const xRatio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const yRatio = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
    const lng = bounds.minLng + xRatio * (bounds.maxLng - bounds.minLng)
    const lat = bounds.maxLat - yRatio * (bounds.maxLat - bounds.minLat)
    addBoundaryPoint(lat, lng)
  }

  const addPointFromInput = () => {
    const raw = String(mapPointInput || '').trim().replace(/[()]/g, '')
    const parts = raw.split(',').map(x => x.trim())
    if (parts.length !== 2) return alert('Use format: lat, lng (example: 5.6037, -0.1870)')
    const lat = Number(parts[0])
    const lng = Number(parts[1])
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return alert('Invalid coordinate values')
    addBoundaryPoint(lat, lng)
  }

  const applyPolygonToFarmForm = () => {
    if (mapPolygonPoints.length < 3) return
    const c = polygonCentroid(mapPolygonPoints)
    const area = polygonAreaHectares(mapPolygonPoints)
    setFarmMapForm(prev => ({
      ...prev,
      gps_lat: `${Number(c?.lat || 0).toFixed(6)}`,
      gps_lng: `${Number(c?.lng || 0).toFixed(6)}`,
      farm_size_hectares: area > 0 ? Number(area.toFixed(2)).toString() : prev.farm_size_hectares,
      harvest_records_notes: JSON.stringify({
        ...(prev.harvest_records_notes ? (() => { try { return JSON.parse(prev.harvest_records_notes) } catch { return { note: prev.harvest_records_notes } } })() : {}),
        map_country: mapCountry,
        boundary_points: mapPolygonPoints
      })
    }))
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

  const baseMenu = ['home', 'dashboard', 'onboarding', 'products', 'livestock', 'services', 'payments', 'alerts', 'maps', 'messaging', 'world-chat', 'community', 'ai-disease', 'plant-id', 'pest-id', 'government', 'contracts']
  const menu = ((me?.role || '').toLowerCase() === 'admin') ? [...baseMenu, 'admin'] : baseMenu
  const menuLabel = (m) => ({
    'home':t('home','home','首页'),
    'dashboard':t('dashboard','dashboard','仪表盘'),
    'onboarding':t('onboarding','onboarding','账户'),
    'products':t('products','products','产品'),
    'livestock':t('livestock','livestock','牲畜'),
    'services':t('services','services','服务'),
    'payments':t('payments','payments','支付'),
    'alerts':t('alerts','alerts','预警'),
    'maps':t('maps','maps','地图'),
    'messaging':t('messaging','messaging','消息'),
    'world-chat':t('World Chat','World Chat','世界聊天'),
    'community':t('FarmSavior Community','FarmSavior Community','FarmSavior 社区'),
    'ai-disease':t('AI Disease Analyzer','AI Disease Analyzer','AI 病害分析'),
    'plant-id':t('AI Plant Identifier','AI Plant Identifier','AI 植物识别'),
    'pest-id':t('AI Insect & Pest Identifier','AI Insect & Pest Identifier','AI 昆虫与害虫识别'),
    'government':t('Government Programs','Government Programs','政府项目'),
    'contracts':t('contracts','contracts','合同'),
    'admin':t('admin','admin','管理员')
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
  const safeGovHeadline = (row) => {
    const raw = String(row?.headline || '')
    const status = String(row?.status || '').toLowerCase()
    const lower = raw.toLowerCase()
    if (status.includes('error') || lower.includes('error') || lower.includes('could not auto-fetch') || lower.includes('timeout') || lower.includes('errno') || lower.includes('failure')) {
      return t('Program details temporarily unavailable. Open source page.', 'Détails du programme temporairement indisponibles. Ouvrez la page source.', '项目详情暂时不可用。请打开来源页面。')
    }
    return raw || t('Official program update', 'Mise à jour officielle du programme', '官方项目更新')
  }
  const publicSpotRows = state.spotTrading.length ? state.spotTrading : featuredSpotSeed
  const publicSpotHistoryRows = state.spotHistory.length ? state.spotHistory : featuredSpotHistorySeed
  const spotUnitByCommodity = {
    maize: { GH: 'per 100kg bag', NG: 'per 100kg bag', BF: 'per 100kg bag', WORLD_AVG: 'per metric ton (reference)' },
    rice: { GH: 'per 50kg bag', NG: 'per 50kg bag', BF: 'per 50kg bag', WORLD_AVG: 'per metric ton (reference)' },
    soybeans: { GH: 'per 100kg bag', NG: 'per 100kg bag', BF: 'per 100kg bag', WORLD_AVG: 'per metric ton (reference)' }
  }
  const spotUnits = (commodity) => {
    const units = spotUnitByCommodity[String(commodity || '').toLowerCase()] || { GH: 'per market unit', NG: 'per market unit', BF: 'per market unit', WORLD_AVG: 'reference unit' }
    if (uiLang !== 'zh') return units
    const map = {
      'per 100kg bag': '每100公斤袋',
      'per 50kg bag': '每50公斤袋',
      'per metric ton (reference)': '每公吨（参考）',
      'per market unit': '每市场单位',
      'reference unit': '参考单位'
    }
    return {
      GH: map[units.GH] || units.GH,
      NG: map[units.NG] || units.NG,
      BF: map[units.BF] || units.BF,
      WORLD_AVG: map[units.WORLD_AVG] || units.WORLD_AVG
    }
  }
  const publicTradeRows = state.tradeExportStats.length ? state.tradeExportStats : featuredTradeExportSeed
  const displayProvenance = (text) => {
    const raw = String(text || '')
    if (uiLang !== 'zh') return raw
    if (!raw) return 'FarmSavior 市场数据'
    if (raw.toLowerCase().includes('aggregated marketplace listings')) return 'FarmSavior 聚合市场挂牌数据（含连续性种子回退）'
    if (raw === 'FarmSavior baseline feed') return 'FarmSavior 基线数据流'
    return zhMap[raw] || raw
  }
  const publicLivestockPlans = state.livestockPlans.length ? state.livestockPlans : featuredLivestockPlansSeed

  const favoriteCurrencies = ['GHS', 'NGN', 'XOF', 'USD', 'EUR', 'GBP']

  const currencyName = (code) => {
    try {
      const dn = new Intl.DisplayNames([uiLang === 'fr' ? 'fr' : (uiLang === 'zh' ? 'zh' : 'en')], { type: 'currency' })
      return dn.of(code) || code
    } catch {
      return code
    }
  }

  const fxRows = useMemo(() => {
    const amount = Number(fxAmount || 0)
    const q = String(fxQuery || '').trim().toLowerCase()
    return Object.entries(fxRates || {})
      .filter(([code]) => {
        if (!q) return true
        const name = currencyName(code).toLowerCase()
        return code.toLowerCase().includes(q) || name.includes(q)
      })
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([code, rate]) => ({ code, name: currencyName(code), value: (amount * Number(rate || 0)) }))
  }, [fxRates, fxAmount, fxQuery, uiLang])

  const unitDefs = {
    m: { label: 'Meters (m)', type: 'length', toBase: (v) => v, fromBase: (v) => v },
    ft: { label: 'Feet (ft)', type: 'length', toBase: (v) => v * 0.3048, fromBase: (v) => v / 0.3048 },
    km: { label: 'Kilometers (km)', type: 'length', toBase: (v) => v * 1000, fromBase: (v) => v / 1000 },
    mi: { label: 'Miles (mi)', type: 'length', toBase: (v) => v * 1609.344, fromBase: (v) => v / 1609.344 },

    ha: { label: 'Hectares (ha)', type: 'area', toBase: (v) => v, fromBase: (v) => v },
    ac: { label: 'Acres (ac)', type: 'area', toBase: (v) => v * 0.40468564224, fromBase: (v) => v / 0.40468564224 },
    m2: { label: 'Square meters (m²)', type: 'area', toBase: (v) => v / 10000, fromBase: (v) => v * 10000 },

    kg: { label: 'Kilograms (kg)', type: 'weight', toBase: (v) => v, fromBase: (v) => v },
    g: { label: 'Grams (g)', type: 'weight', toBase: (v) => v / 1000, fromBase: (v) => v * 1000 },
    lb: { label: 'Pounds (lb)', type: 'weight', toBase: (v) => v * 0.45359237, fromBase: (v) => v / 0.45359237 },
    t: { label: 'Metric tons (t)', type: 'weight', toBase: (v) => v * 1000, fromBase: (v) => v / 1000 }
  }

  const unitCodes = Object.keys(unitDefs)
  const convertedUnitValue = useMemo(() => {
    const n = Number(unitValue || 0)
    if (!Number.isFinite(n)) return ''
    const from = unitDefs[unitFrom]
    const to = unitDefs[unitTo]
    if (!from || !to) return ''
    if (from.type !== to.type) return ''
    const base = from.toBase(n)
    const out = to.fromBase(base)
    return Number.isFinite(out) ? out : ''
  }, [unitValue, unitFrom, unitTo])

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
          <h2 style={{margin:0}}>{isZh ? 'FarmSavior 市场实时' : t('FarmSavior Marketplace Live','Marché FarmSavior en direct')}</h2>
        </div>
        <p style={{opacity:.95}}>{isZh ? '覆盖加纳、尼日利亚和布基纳法索的高需求产品与服务。可自由浏览；联系服务商或使用工具请注册/登录。' : t('High-demand products and services across Ghana, Nigeria, and Burkina Faso. Browse freely. To contact providers or use tools, sign up/sign in.','Produits et services à forte demande au Ghana, au Nigeria et au Burkina Faso. Parcourez librement. Pour contacter les fournisseurs ou utiliser les outils, inscrivez-vous/connectez-vous.')}</p>
        <div className='inlineForm' style={{background:'rgba(255,255,255,.12)', border:'1px solid rgba(255,255,255,.25)', marginBottom:8}}>
          <select className='input' value={uiCountry} onChange={(e)=>setUiCountry(e.target.value)}>
            <option value='GH'>Ghana</option><option value='NG'>Nigeria</option><option value='BF'>Burkina Faso</option>
          </select>
          <select className='input' value={uiLang} onChange={(e)=>setUiLang(e.target.value)}>
            <option value='en'>English</option><option value='fr'>Français</option><option value='zh'>中文</option>
          </select>
          <div className='list-row' style={{padding:'6px 10px', background:'rgba(255,255,255,.85)'}}><span>{t('Currency','Devise','货币')}</span><strong>{currencyByCountry[uiCountry]}</strong></div>
          <div className='list-row' style={{padding:'6px 10px', background:'rgba(255,255,255,.85)'}}><span>{t('Payment methods','Moyens de paiement','支付方式')}</span><strong>{paymentProviders[uiCountry].join(', ')}</strong></div>
        </div>
        <form className='inlineForm' onSubmit={(e)=>{e.preventDefault(); addRecentSearch(publicQuery)}} style={{background:'rgba(255,255,255,.12)', border:'1px solid rgba(255,255,255,.25)'}}>
          <input className='input' placeholder={t('Search products, services, market activity…','Rechercher produits, services, activité du marché…','搜索产品、服务、市场动态…')} value={publicQuery} onChange={(e)=>setPublicQuery(e.target.value)} />
          <button className='btn btn-dark'>{t('Search','Rechercher','搜索')}</button>
          <button type='button' className='btn' onClick={()=>setPublicQuery('')}>{t('Clear','Effacer','清除')}</button>
        </form>
        <p style={{fontSize:'.8rem',opacity:.9,marginTop:8}}>{isZh ? '安全提示：内容和AI结果仅供参考。行动前请在本地与合格的农学/兽医专业人士核实。' : t('Safety notice: Content and AI outputs are guidance only. Verify locally with qualified agronomy/veterinary professionals before acting.','Avis de sécurité : le contenu et les résultats IA sont indicatifs. Vérifiez localement avec des professionnels qualifiés (agronomie/vétérinaire) avant d’agir.')}</p>
      </div>

      {!token && authPrompt === 'login' && <div className='panel' style={{marginTop:10, background:'#ecfeff', border:'1px solid #99f6e4'}}>
        <div className='list-row'>
          <span>{t('Please sign in or create an account to continue.','Veuillez vous connecter ou créer un compte pour continuer.')}</span>
          <button type='button' className='btn btn-dark' onClick={()=>setShowAuthModal(true)}>{t('Open Login Popup','Ouvrir la fenêtre de connexion')}</button>
        </div>
      </div>}

      {!token && showAuthModal && <div style={{position:'fixed',inset:0,background:'rgba(2,6,23,.55)',zIndex:2000,display:'grid',placeItems:'center',padding:16}}>
        <div className='panel' style={{width:'min(520px,96vw)', border:'2px solid #99f6e4'}}>
          <h3 style={{marginTop:0}}>{t('Sign in required','Connexion requise')}</h3>
          <p style={{marginTop:0,color:'#475569'}}>{pendingFeatureLabel ? t(`To access ${pendingFeatureLabel}, please sign in or create an account.`,`Pour accéder à ${pendingFeatureLabel}, veuillez vous connecter ou créer un compte.`) : t('Please sign in or create an account to continue.','Veuillez vous connecter ou créer un compte pour continuer.')}</p>
          <div className='inlineForm' style={{marginBottom:0}}>
            <button type='button' className='btn btn-dark' onClick={()=>{ setAuthMode('login'); setShowAuthModal(false); const el=document.getElementById('access-portal'); if (el) el.scrollIntoView({behavior:'smooth', block:'start'}) }}>{t('Sign In','Se connecter')}</button>
            <button type='button' className='btn' onClick={()=>{ setAuthMode('signup'); setShowAuthModal(false); const el=document.getElementById('access-portal'); if (el) el.scrollIntoView({behavior:'smooth', block:'start'}) }}>{t('Create Account','Créer un compte')}</button>
            <button type='button' className='btn' onClick={()=>setShowAuthModal(false)}>{t('Cancel','Annuler')}</button>
          </div>
        </div>
      </div>}

      <div className='three-col' style={{marginTop:10}}>
        <article className='panel' style={{minHeight: showHighDemandProducts ? 430 : 'auto'}}>
          <div className='list-row' style={{marginBottom:8}}>
            <h3 style={{margin:0}}>{t('🔥 High Demand Products','🔥 Produits à forte demande','🔥 高需求产品')}</h3>
            <button className='btn' onClick={()=>setShowHighDemandProducts(v=>!v)}>{showHighDemandProducts ? t('Hide','Masquer') : t('Show','Afficher')}</button>
          </div>
          {showHighDemandProducts && <div className='list'>
            {lockDemandCount(
              featuredProductsSeed.filter(x => !publicQuery || `${x.name}`.toLowerCase().includes(publicQuery.toLowerCase())),
              (n) => ({ name: `Market item ${n}` })
            ).map((x,i)=>{
              const inventory = Number(productInventoryByName.get(x.name) || 0)
              return <div className='list-row' key={`p-${i}`}><span>{displayProductName(x.name)}</span><strong>{inventory.toLocaleString()}</strong></div>
            })}
          </div>}
        </article>

        <article className='panel' style={{minHeight: showHighDemandServices ? 430 : 'auto'}}>
          <div className='list-row' style={{marginBottom:8}}>
            <h3 style={{margin:0}}>{t('🚚 High Demand Services','🚚 Services à forte demande','🚚 高需求服务')}</h3>
            <button className='btn' onClick={()=>setShowHighDemandServices(v=>!v)}>{showHighDemandServices ? t('Hide','Masquer') : t('Show','Afficher')}</button>
          </div>
          {showHighDemandServices && <div className='list'>
            {lockDemandCount(
              featuredServicesSeed.filter(x => !publicQuery || `${x.name}`.toLowerCase().includes(publicQuery.toLowerCase())),
              (n) => ({ name: `Service slot ${n}` })
            ).map((x,i)=>{
              const inventory = Number(serviceInventoryByName.get(x.name) || 0)
              return <div className='list-row' key={`s-${i}`}><span>{displayServiceName(x.name)}</span><strong>{inventory.toLocaleString()}</strong></div>
            })}
          </div>}
        </article>

        <article className='panel'>
          <h3>{t('🧠 Popular Actions','🧠 Actions populaires','🧠 热门操作')}</h3>
          <div className='list'>
            <div className='list-row'><span>{t('List Product','Publier un produit','发布产品')}</span><button type='button' className='btn' onClick={()=>handleProtectedAction('products', 'List Product')}>{t('Start','Démarrer')}</button></div>
            <div className='list-row'><span>{t('List Services','Publier des services','发布服务')}</span><button type='button' className='btn' onClick={()=>handleProtectedAction('services', 'List Services')}>{t('Start','Démarrer')}</button></div>
            <div className='list-row'><span>{t('List Machinery for Rent','Publier des machines à louer','发布机械租赁')}</span><button type='button' className='btn' onClick={()=>handleProtectedAction('services', 'List Machinery for Rent')}>{t('Start','Démarrer')}</button></div>
            <div className='list-row'><span>{t('Rent Machinery','Louer des machines','租用机械')}</span><button type='button' className='btn' onClick={()=>handleProtectedAction('services', 'Rent Machinery')}>{t('Start','Démarrer')}</button></div>
            <div className='list-row'><span>{t('Request Logistics / Transport','Demander logistique / transport','请求物流/运输')}</span><button type='button' className='btn' onClick={()=>handleProtectedAction('services', 'Request Logistics / Transport')}>{t('Start','Démarrer')}</button></div>
            <div className='list-row'><span>{t('Find Storage / Cold Room','Trouver stockage / chambre froide','寻找仓储/冷库')}</span><button type='button' className='btn' onClick={()=>handleProtectedAction('services', 'Find Storage / Cold Room')}>{t('Start','Démarrer')}</button></div>
            <div className='list-row'><span>{t('AI Disease Analyzer','Analyseur IA des maladies','AI 病害分析')}</span><button type='button' className='btn' onClick={()=>handleProtectedAction('ai-disease', 'AI Disease Analyzer')}>{t('Open','Ouvrir')}</button></div>
            <div className='list-row'><span>{t('AI Plant Identifier','Identificateur IA des plantes','AI 植物识别')}</span><button type='button' className='btn' onClick={()=>handleProtectedAction('plant-id', 'AI Plant Identifier')}>{t('Open','Ouvrir')}</button></div>
            <div className='list-row'><span>{t('AI Insect & Pest Identifier','Identificateur IA insectes et ravageurs','AI 昆虫与害虫识别')}</span><button type='button' className='btn' onClick={()=>handleProtectedAction('pest-id', 'AI Insect & Pest Identifier')}>{t('Open','Ouvrir')}</button></div>
            <div className='list-row'><span>{t('Farm GPS Mapping','Cartographie GPS des fermes','农场GPS标注')}</span><button type='button' className='btn' onClick={()=>handleProtectedAction('maps', 'Farm GPS Mapping')}>{t('Open','Ouvrir')}</button></div>
            <div className='list-row'><span>{t('Global World Chat','Chat mondial','全球聊天')}</span><button type='button' className='btn' onClick={()=>handleProtectedAction('world-chat', 'Global World Chat')}>{t('Open','Ouvrir','打开')}</button></div>
          </div>
          <p style={{fontSize:'.82rem', color:'#64748b'}}>{t('You can browse publicly; posting, renting, contacting providers, and transactions require sign-in.','Vous pouvez parcourir publiquement ; publier, louer, contacter des prestataires et effectuer des transactions nécessite une connexion.','你可以公开浏览；发布、租赁、联系服务商和交易需要登录。')}</p>
        </article>
      </div>

      <div className='two-col' style={{marginTop:10}}>
        <article className='panel'>
          <h3>{t('🌤️ 9-City Weather Forecast (Ghana • Nigeria • Burkina Faso)','🌤️ Prévisions météo de 9 villes (Ghana • Nigeria • Burkina Faso)','🌤️ 9城天气预报（加纳 • 尼日利亚 • 布基纳法索）')}</h3>
          <p style={{fontSize:'.82rem', color:'#64748b', margin:'4px 0 10px'}}>{t('Country codes: GH = Ghana, NG = Nigeria, BF = Burkina Faso.','Codes pays : GH = Ghana, NG = Nigeria, BF = Burkina Faso.','国家代码：GH=加纳，NG=尼日利亚，BF=布基纳法索。')}</p>
          <div className='tabs' style={{marginBottom:10, flexWrap:'wrap'}}>
            {['GH','NG','BF'].map((c) => (
              <button key={`wx-${c}`} className={`tab ${expandedWeatherCountry === c ? 'active' : ''}`} onClick={() => setExpandedWeatherCountry(c)}>
                {displayCountryLabel(c)}
              </button>
            ))}
          </div>
          <div className='news-grid'>
            {(weatherByCountry[expandedWeatherCountry] || []).map((w,i)=>(
              <div className='news-card' key={`w-${expandedWeatherCountry}-${i}`}>
                <div className='news-body'>
                  <div className='news-title'>{w.city}, {w.country}</div>
                  <div className='news-meta'>{t('Condition','Condition','天气状况')}: {displayWeatherCondition(w.condition || '-')}</div>
                  <div className='news-meta'>{t('Temp','Temp','气温')}: {w.temperature_c}°C • {t('Humidity','Humidité','湿度')}: {w.humidity_pct}% • {t('Rainfall','Pluie','降雨量')}: {w.rainfall_mm} mm</div>
                </div>
              </div>
            ))}
          </div>

          <p style={{fontSize:'.85rem', color:'#0f766e', marginTop:8}}>{t('Free forecast preview for farmers. Sign up to unlock personalized alerts and farm-level recommendations.','Aperçu météo gratuit pour les agriculteurs. Inscrivez-vous pour débloquer des alertes personnalisées et des recommandations au niveau de l’exploitation.','面向农户的免费天气预览。注册即可解锁个性化预警和农场级建议。')}</p>


          <h3 style={{marginTop:12}}>{t('📰 Ag News + Innovation','📰 Actualités agricoles + innovation','📰 农业新闻与创新')}</h3>
          <div className='news-grid'>
            {publicNewsRows.slice(0,8).map((n,i)=>(
              <div
                className='news-card'
                key={`n-${i}`}
                role='button'
                tabIndex={0}
                onClick={() => { if (n.url) window.open(n.url, '_blank', 'noopener,noreferrer') }}
                onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && n.url) { e.preventDefault(); window.open(n.url, '_blank', 'noopener,noreferrer') } }}
                style={{cursor: n.url ? 'pointer' : 'default'}}
              >
                {(String(n.image_url || '').startsWith('http://') || String(n.image_url || '').startsWith('https://') || isUserImage(n.image_url))
                  ? <img src={n.image_url} alt={n.title} className='news-img' />
                  : <div className='news-img' style={{display:'grid',placeItems:'center',color:'#64748b',background:'#f1f5f9'}}>No image available</div>}
                <div className='news-body'>
                  <a href={n.url} target='_blank' rel='noreferrer' className='news-title' onClick={(e)=>e.stopPropagation()}>{displayNewsTitle(n.title)}</a>
                  <div className='news-meta'>{uiLang === 'zh' ? ({
                    'FarmSavior News Desk': 'FarmSavior 新闻台',
                    'FarmSavior Wire': 'FarmSavior 快讯',
                    'FarmSavior Weather Desk': 'FarmSavior 天气台',
                    'FarmSavior Markets': 'FarmSavior 市场台'
                  }[n.source] || 'FarmSavior 新闻') : n.source} {n.published ? `• ${uiLang === 'fr' && n.published === 'Live' ? 'En direct' : (uiLang === 'zh' && n.published === 'Live' ? '实时' : n.published)}` : ''}</div>
                  <div className='news-credit'>{n.image_credit || t('Image credit: source / Unsplash','Crédit image : source / Unsplash','图片来源：source / Unsplash')}</div>
                </div>
              </div>
            ))}
          </div>
          <p style={{fontSize:'.82rem', color:'#64748b'}}>{t('Sources and image credits are shown on each story.','Les sources et crédits image sont affichés sur chaque article.','每条资讯都显示来源与图片署名。')}</p>
        </article>

        <article className='panel' id='access-portal'>
          <h3>{t('Access Portal','Portail d’accès','访问入口')}</h3>
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

          <div className='tabs'>{['login', 'signup'].map(m => <button key={m} className={`tab ${authMode === m ? 'active' : ''}`} onClick={() => setAuthMode(m)}>{m === 'login' ? t('LOGIN','LOGIN','登录') : t('SIGNUP','INSCRIPTION','注册')}</button>)}</div>

          {authMode === 'signup' && <form className='list' onSubmit={async (e) => {
            try {
              e.preventDefault();
              if (!signup.accept_terms || !signup.accept_privacy) { setAuthMsg('Please accept Terms and Privacy to continue.'); return }
              const payload = {
                full_name: signup.full_name,
                signup_method: signup.signup_method,
                phone: signup.signup_method === 'phone' ? normalizePhone(signup.phone) : undefined,
                email: signup.signup_method === 'email' ? signup.email : undefined,
                country: signup.country,
                region: signup.region,
                user_type: signup.user_type,
                password: signup.password,
              }
              await api.register(payload)
              await api.trackAnalyticsEvent({
                event_name: 'consent_captured',
                country: signup.country,
                role_hint: signup.user_type,
                properties: {
                  accept_terms: !!signup.accept_terms,
                  accept_privacy: !!signup.accept_privacy,
                  consent_analytics: !!signup.consent_analytics,
                  consent_personalization: !!signup.consent_personalization,
                  consent_marketing: !!signup.consent_marketing,
                  consent_aggregated_insights: !!signup.consent_aggregated_insights,
                  consent_version: 'v1',
                  captured_at_utc: new Date().toISOString()
                }
              }).catch(() => {})
              try {
                localStorage.setItem('farmsavior_consent', JSON.stringify({
                  accept_terms: !!signup.accept_terms,
                  accept_privacy: !!signup.accept_privacy,
                  consent_analytics: !!signup.consent_analytics,
                  consent_personalization: !!signup.consent_personalization,
                  consent_marketing: !!signup.consent_marketing,
                  consent_aggregated_insights: !!signup.consent_aggregated_insights,
                  consent_version: 'v1',
                  captured_at_utc: new Date().toISOString()
                }))
              } catch {}
              const identifier = signup.signup_method === 'email' ? signup.email : normalizePhone(signup.phone)
              const loginRes = await api.login({ identifier: normalizeIdentifier(identifier), password: signup.password })
              saveToken(loginRes.access_token)
              setAuthMsg('Account created and signed in successfully.')
            } catch (e) { setAuthMsg(`Signup failed: ${errMsg(e)}`) }
          }}>
            <input className='input' placeholder='Full name' value={signup.full_name} onChange={e => setSignup({ ...signup, full_name: e.target.value })} required />
            <input className='input' placeholder='Phone' value={signup.phone} onChange={e => setSignup({ ...signup, signup_method: 'phone', phone: e.target.value })} required />
            <div style={{fontSize:'.76rem', color:'#64748b'}}>Phone OTP signup is active. Email OTP will be re-enabled after dedicated mail sender configuration.</div>
            <div className='row2'>
              <input className='input' placeholder='Country (any code or name, e.g. US, KE, Brazil)' value={signup.country} onChange={e => setSignup({ ...signup, country: e.target.value })} required />
              <input className='input' placeholder='Region' value={signup.region} onChange={e => setSignup({ ...signup, region: e.target.value })} required />
            </div>
            <select className='input' value={signup.user_type} onChange={e => setSignup({ ...signup, user_type: e.target.value })}>{userTypes.map(u => <option key={u}>{u}</option>)}</select>
            <input className='input' type='password' placeholder={t('Password','Mot de passe','密码')} value={signup.password} onChange={e => setSignup({ ...signup, password: e.target.value })} required />
            <div className='panel' style={{padding:8, background:'#f8fafc'}}>
              <label style={{display:'block',fontSize:'.84rem'}}><input type='checkbox' checked={signup.accept_terms} onChange={e => setSignup({ ...signup, accept_terms: e.target.checked })} /> I agree to Terms of Service.</label>
              <label style={{display:'block',fontSize:'.84rem'}}><input type='checkbox' checked={signup.accept_privacy} onChange={e => setSignup({ ...signup, accept_privacy: e.target.checked })} /> I agree to Privacy Policy.</label>
              <label style={{display:'block',fontSize:'.84rem'}}><input type='checkbox' checked={signup.consent_analytics} onChange={e => setSignup({ ...signup, consent_analytics: e.target.checked })} /> Help improve FarmSavior with usage analytics.</label>
              <label style={{display:'block',fontSize:'.84rem'}}><input type='checkbox' checked={signup.consent_personalization} onChange={e => setSignup({ ...signup, consent_personalization: e.target.checked })} /> Personalize feed, recommendations, and alerts.</label>
              <label style={{display:'block',fontSize:'.84rem'}}><input type='checkbox' checked={signup.consent_marketing} onChange={e => setSignup({ ...signup, consent_marketing: e.target.checked })} /> Receive product updates and offers.</label>
              <label style={{display:'block',fontSize:'.84rem'}}><input type='checkbox' checked={signup.consent_aggregated_insights} onChange={e => setSignup({ ...signup, consent_aggregated_insights: e.target.checked })} /> Allow anonymized aggregated insights for ecosystem reports.</label>
              <div style={{fontSize:'.76rem', color:'#64748b', marginTop:6}}>You can update these preferences anytime in account settings.</div>
            </div>
            <button className='btn btn-dark'>Create Account</button>
          </form>}

          {authMode === 'login' && <form className='list' onSubmit={async (e) => {
            try { e.preventDefault(); const r = await api.login({ ...login, identifier: normalizeIdentifier(login.identifier) }); saveToken(r.access_token) } catch (e) { setAuthMsg(`Login failed: ${errMsg(e)}`) }
          }}>
            <input className='input' placeholder={t('Phone or Email','Téléphone ou e-mail','手机号或邮箱')} value={login.identifier} onChange={e => setLogin({ ...login, identifier: e.target.value })} required />
            <input className='input' type='password' placeholder={t('Password','Mot de passe','密码')} value={login.password} onChange={e => setLogin({ ...login, password: e.target.value })} required />
            <button className='btn btn-dark'>{t('Login','Connexion','登录')}</button>
          </form>}

          </>}
          <p>{authMsg}</p>

          <div className='panel' style={{marginTop:10,padding:10,background:'#f8fafc'}}>
            <h4 style={{margin:'0 0 6px'}}>{t('🌍 Global World Chat','🌍 Chat mondial','🌍 全球世界聊天')}</h4>
            <div className='list' style={{maxHeight:180, overflow:'auto'}}>
              {worldChat.slice(-5).map((m)=><div className='list-row' key={`pub-wc-${m.id}`}><span><strong>{m.user_name || `User ${m.user_id}`}:</strong> {m.text}</span></div>)}
              {!worldChat.length && <div className='list-row'><span>{t('No messages yet.','Aucun message pour le moment.')}</span></div>}
            </div>
            <div className='list-row' style={{marginTop:8}}>
              <span>{t('Join the conversation with farmers worldwide.','Rejoignez la conversation avec des agriculteurs du monde entier.','与全球农民一起加入对话。')}</span>
              <button type='button' className='btn' onClick={()=>handleProtectedAction('world-chat', 'Global World Chat')}>{t('Open Chat','Ouvrir le chat','打开聊天')}</button>
            </div>
          </div>

          <div className='panel' style={{marginTop:10,padding:10,background:'#f8fafc'}}>
            <h4 style={{margin:'0 0 6px'}}>{isZh ? '📲 下载到手机' : t('📲 Download App to Phone','📲 Télécharger l’application sur le téléphone','📲 下载到手机')}</h4>
            <div style={{fontSize:'.84rem',color:'#334155'}}>
              <div><strong>{isZh ? 'iPhone（Safari）：' : t('iPhone (Safari):','iPhone (Safari) :','iPhone（Safari）：')}</strong> {isZh ? '打开 farmsavior.com → 分享 → 添加到主屏幕。' : t('Open farmsavior.com → Share → Add to Home Screen.','Ouvrez farmsavior.com → Partager → Sur l’écran d’accueil.','打开 farmsavior.com → 分享 → 添加到主屏幕。')}</div>
              <div><strong>{isZh ? 'Android（Chrome）：' : t('Android (Chrome):','Android (Chrome) :','Android（Chrome）：')}</strong> {isZh ? '打开 farmsavior.com → ⋮ 菜单 → 安装应用 / 添加到主屏幕。' : t('Open farmsavior.com → ⋮ menu → Install app / Add to Home screen.','Ouvrez farmsavior.com → menu ⋮ → Installer l’app / Ajouter à l’écran d’accueil.','打开 farmsavior.com → ⋮ 菜单 → 安装应用 / 添加到主屏幕。')}</div>
            </div>
          </div>

          <div className='list-row' style={{marginTop:12}}>
            <h3 style={{margin:0}}>{t('📈 Spot Trading (Ghana • Nigeria • Burkina Faso • World Avg)','📈 Trading Spot (Ghana • Nigeria • Burkina Faso • Moyenne mondiale)','📈 现货交易（加纳 • 尼日利亚 • 布基纳法索 • 全球均值）')}</h3>
            <button className='btn' onClick={() => window.print()}>{t('Export Briefing (PDF)','Exporter le briefing (PDF)','导出简报（PDF）')}</button>
          </div>
          <p style={{fontSize:'.8rem', color:'#64748b', margin:'6px 0 8px'}}>
            {t('Units: GH in GHS per market unit, NG in NGN per market unit, BF in XOF per market unit, World Avg in USD reference unit.','Unités : GH en GHS par unité de marché, NG en NGN par unité de marché, BF en XOF par unité de marché, moyenne mondiale en unité de référence USD.','单位：GH 以 GHS/市场单位，NG 以 NGN/市场单位，BF 以 XOF/市场单位，全球均值以 USD 参考单位。')}
          </p>
          <div className='tabs' style={{marginTop:8, marginBottom:8, flexWrap:'wrap'}}>
            {publicSpotRows.map((r, i) => (
              <button
                key={`spot-tab-${r.commodity || i}`}
                className={`tab ${expandedSpotCommodity === r.commodity ? 'active' : ''}`}
                onClick={() => setExpandedSpotCommodity(r.commodity)}
              >
                {displayCommodityName(r.commodity)}
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
                const units = spotUnits(r.commodity)
                return <div key={`st-right-${i}`} className='panel' style={{padding:10}}>
                  <div style={{fontWeight:700, marginBottom:6}}>{displayCommodityName(r.commodity)}</div>
                  <div style={{fontSize:12,color:'#64748b',marginBottom:6}}>{t('Date','Date','日期')}: {r.updated_at_utc || hist.updated_at_utc || t('Live feed','Flux en direct','实时数据')}</div>
                  <div style={{fontSize:12,color:'#64748b',marginBottom:6}}>{t('Market units','Unités de marché','市场单位')}: GH {units.GH} • NG {units.NG} • BF {units.BF} • {t('World','Monde','全球')} {units.WORLD_AVG}</div>
                  <div className='list-row'><span>{t('Ghana','Ghana','加纳')} ({r.GH} GHS)</span><div style={{height:8,width:bar(r.GH),background:'#16a34a',borderRadius:99}} /></div>
                  <div className='list-row'><span>{t('Nigeria','Nigeria','尼日利亚')} ({r.NG} NGN)</span><div style={{height:8,width:bar(r.NG),background:'#0284c7',borderRadius:99}} /></div>
                  <div className='list-row'><span>{t('Burkina Faso','Burkina Faso','布基纳法索')} ({r.BF} XOF)</span><div style={{height:8,width:bar(r.BF),background:'#ea580c',borderRadius:99}} /></div>
                  <div className='list-row'><span>{t('World Avg','Moyenne mondiale','全球均值')} ({r.WORLD_AVG} USD)</span><div style={{height:8,width:bar(r.WORLD_AVG),background:'#334155',borderRadius:99}} /></div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'#475569',marginTop:6}}>
                    <span>{t('7d','7j','7天')}: {hist.change_pct_7d ?? 0}%</span><span>{t('30d','30j','30天')}: {hist.change_pct_30d ?? 0}%</span>
                  </div>
                  <svg width='180' height='32' style={{marginTop:4, background:'#f8fafc', borderRadius:6}}>
                    <polyline fill='none' stroke='#0f766e' strokeWidth='2' points={points || '0,28 180,4'} />
                  </svg>
                  <div style={{fontSize:11,color:'#64748b'}}>{t('Source','Source','来源')}: {displayProvenance(hist.provenance || t('FarmSavior market feed','Flux marché FarmSavior','FarmSavior 市场数据'))}</div>
                </div>
              })}
          </div>
        </article>
      </div>

      <article className='panel' style={{marginTop:10}}>
        <h3>{t('🏛️ Government Programs & Subsidies (Ghana • Nigeria • Burkina Faso)','🏛️ Programmes gouvernementaux & subventions (Ghana • Nigeria • Burkina Faso)','🏛️ 政府项目与补贴（加纳・尼日利亚・布基纳法索）')}</h3>
        <div className='list'>
          {publicGovRows.slice(0, 6).map((g, i) => (
            <div className='list-row' key={`gov-${i}`}>
              <span>{g.country} • {g.agency} • {safeGovHeadline(g)} ({String(g.status || 'ok').toLowerCase().includes('error') ? t('unavailable','indisponible','不可用') : (g.status || 'ok')})</span>
              <a className='btn' href={g.source_url} target='_blank' rel='noreferrer'>{t('Programs Page','Page des programmes','项目页面')}</a>
            </div>
          ))}
          {false && <div className='list-row'><span>Loading official ministry programs…</span></div>}
        </div>
      </article>

      <article className='panel' style={{marginTop:10}}>
        <h3>{t('🌍 Current Export/Import Statistics (Top 10 + Volumes)','🌍 Statistiques actuelles export/import (Top 10 + volumes)','🌍 当前进出口统计（前10名+总量）')}</h3>
        <p style={{fontSize:'.85rem',color:'#475569'}}>{t('Select a commodity below to expand its export/import rankings.','Sélectionnez une marchandise ci-dessous pour afficher ses classements export/import.','请选择下方商品以展开查看其进出口排名。')}</p>

        <div className='tabs' style={{marginBottom:10, flexWrap:'wrap'}}>
          {publicTradeRows.map((c, i) => {
            const key = c.commodity_key || c.commodity || `c-${i}`
            return (
              <button
                key={`trade-tab-${key}`}
                className={`tab ${expandedTradeCommodity === key ? 'active' : ''}`}
                onClick={() => setExpandedTradeCommodity(key)}
              >
                {displayCommodityName(c.commodity)}
              </button>
            )
          })}
        </div>

        {publicTradeRows
          .filter((c, i) => (c.commodity_key || c.commodity || `c-${i}`) === expandedTradeCommodity)
          .map((c, i) => (
            <div className='panel' key={`trade-expanded-${i}`} style={{padding:10}}>
              <h4 style={{marginTop:0}}>{displayCommodityName(c.commodity)}</h4>

              <div className='list-row' style={{marginBottom:6}}>
                <div style={{fontWeight:600}}>{t('Top 10 Exporters','Top 10 exportateurs','前10大出口国')}</div>
                <button className='btn' onClick={() => setExpandedTradeSections((s) => ({ ...s, [`${c.commodity_key || c.commodity}-exp`]: !s[`${c.commodity_key || c.commodity}-exp`] }))}>
                  {expandedTradeSections[`${c.commodity_key || c.commodity}-exp`] ? t('Hide','Masquer') : t('Show','Afficher')}
                </button>
              </div>
              {expandedTradeSections[`${c.commodity_key || c.commodity}-exp`] && <div className='list'>
                {(c.top_exporters || []).slice(0,10).map((r) => (
                  <div className='list-row' key={`exp-${c.commodity_key}-${r.rank}`}>
                    <span>{r.rank}. {r.country}</span>
                    <strong>{Number(r.volume_tons || 0).toLocaleString()} t</strong>
                  </div>
                ))}
              </div>}

              <div className='list-row' style={{margin:'10px 0 6px'}}>
                <div style={{fontWeight:600}}>{t('Top 10 Importers','Top 10 importateurs','前10大进口国')}</div>
                <button className='btn' onClick={() => setExpandedTradeSections((s) => ({ ...s, [`${c.commodity_key || c.commodity}-imp`]: !s[`${c.commodity_key || c.commodity}-imp`] }))}>
                  {expandedTradeSections[`${c.commodity_key || c.commodity}-imp`] ? t('Hide','Masquer') : t('Show','Afficher')}
                </button>
              </div>
              {expandedTradeSections[`${c.commodity_key || c.commodity}-imp`] && <div className='list'>
                {(c.top_importers || []).slice(0,10).map((r) => (
                  <div className='list-row' key={`imp-${c.commodity_key}-${r.rank}`}>
                    <span>{r.rank}. {r.country}</span>
                    <strong>{Number(r.volume_tons || 0).toLocaleString()} t</strong>
                  </div>
                ))}
              </div>}
            </div>
          ))}

        {false && <div className='list-row'><span>Loading current export/import statistics…</span></div>}
      </article>

      <article className='panel' style={{marginTop:10}}>
        <h3>{t('🐑 Sheep & Goats Records & Intelligence Platform (Africa-Wide)','🐑 Plateforme de registres et d’intelligence ovins/caprins (Afrique entière)','🐑 羊与山羊记录与智能平台（非洲范围）')}</h3>
        <p style={{fontSize:'.85rem',color:'#475569'}}>{t('A production-grade livestock records system for sheep and goats, with traceability, breeding performance, health tracking, and subscription-based access for operators across Africa.','Un système professionnel de registres d’élevage pour ovins et caprins, avec traçabilité, performance de reproduction, suivi sanitaire et accès par abonnement pour les opérateurs en Afrique.','面向非洲运营者的生产级羊与山羊记录系统，包含溯源、繁育绩效、健康追踪和订阅访问。')}</p>
        <p style={{fontSize:'.82rem',color:'#64748b',marginTop:4}}>{t('Pricing auto-displays in your selected country currency. Settlement can route to Ghana Mobile Money or US bank account once payout details are configured.','Les prix s’affichent automatiquement dans la devise du pays sélectionné. Le règlement peut être acheminé vers Mobile Money Ghana ou un compte bancaire US une fois les détails de paiement configurés.','价格会按你选择的国家货币自动显示。配置收款后，可结算到加纳移动支付或美国银行账户。')}</p>
        <h4 style={{margin:'8px 0'}}>{t('Select Your Subscription Plan','Sélectionnez votre plan d’abonnement','选择你的订阅方案')}</h4>
        <div className='tabs' style={{marginBottom:10, flexWrap:'wrap'}}>
          {publicLivestockPlans.map((p, i) => {
            const key = p.plan_code || p.name || `plan-${i}`
            return <button key={`plan-tab-${key}`} className={`tab ${expandedLivestockPlan === key ? 'active' : ''}`} onClick={() => setExpandedLivestockPlan(key)}>{displayPlanName(p.name)}</button>
          })}
        </div>

        <div>
          {publicLivestockPlans
            .filter((p, i) => (p.plan_code || p.name || `plan-${i}`) === expandedLivestockPlan)
            .map((p, i) => (
            <div className='panel' key={`plan-${i}`} style={{padding:10}}>
              <h4 style={{marginTop:0}}>{displayPlanName(p.name)}</h4>
              <div className='list-row'><span>{t('Monthly','Mensuel','月付')}</span><strong>{formatLocalPrice(p.monthly_usd)}</strong></div>
              <div className='list-row'><span>{t('Yearly','Annuel','年付')}</span><strong>{formatLocalPrice(p.yearly_usd)}</strong></div>
              <div className='list'>
                {(p.features || []).map((f, j) => <div className='list-row' key={`pf-${i}-${j}`}><span>{displayFeature(f)}</span></div>)}
              </div>
              <div className='list-row' style={{marginTop:8}}>
                <button className='btn btn-dark' onClick={async () => {
                  if (!token) { handleProtectedAction('onboarding', 'Subscription checkout'); return }
                  try {
                    const r = await api.checkoutLivestockRecordsPlan({
                      user_id: Number(me?.id || 1),
                      plan_code: p.plan_code || 'starter',
                      country: uiCountry,
                      billing_cycle: 'monthly',
                      currency: selectedCurrency
                    })
                    if (r.trial_active) {
                      alert(t(`7-day free trial started. No charge now. Free cancellation before: ${r.free_cancellation_before || r.trial_ends_at}. Ref: ${r.reference}`,`Essai gratuit de 7 jours activé. Aucun débit maintenant. Annulation gratuite avant : ${r.free_cancellation_before || r.trial_ends_at}. Réf : ${r.reference}`))
                    } else if (r.payment_url) {
                      // Mobile Safari/Chrome often blocks popups; force same-tab redirect for reliability.
                      try {
                        const popup = window.open(r.payment_url, '_blank', 'noopener,noreferrer')
                        if (!popup) {
                          window.location.assign(r.payment_url)
                        }
                      } catch {
                        window.location.assign(r.payment_url)
                      }
                      alert(t(`Redirecting to secure payment now. Ref: ${r.reference}`,`Redirection vers le paiement sécurisé. Réf : ${r.reference}`))
                    } else {
                      alert(t(`Checkout created. Ref: ${r.reference}`,`Paiement créé. Réf : ${r.reference}`))
                    }
                  } catch (e) { alert(t(`Checkout failed: ${errMsg(e)}`,`Échec du paiement : ${errMsg(e)}`)) }
                }}>{t('Subscribe','S’abonner','订阅')}</button>
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className='panel' style={{marginTop:10}}>
        <div className='list-row'>
          <h3 style={{margin:0}}>{t('📸 FarmSavior Community','📸 Communauté FarmSavior','📸 FarmSavior 社区')}</h3>
          <button className='btn btn-dark' onClick={()=>handleProtectedAction('community', 'FarmSavior Community')}>{t('Open Community','Ouvrir la communauté','打开社区')}</button>
        </div>
        <div className='list' style={{maxHeight:220, overflow:'auto'}}>
          {communityPosts.slice(0, 4).map((p)=><div key={`pub-cp-${p.id}`} className='panel' style={{padding:8}}>
            <div style={{fontWeight:700}}>{p.author_name || `User ${p.user_id}`} {p.author_country ? `(${p.author_country})` : ''}</div>
            {!!p.text && <div style={{fontSize:'.9rem'}}>{String(p.text).slice(0, 140)}{String(p.text).length > 140 ? '…' : ''}</div>}
            {p.media_url && <div style={{fontSize:'.8rem', color:'#64748b'}}>{p.media_type || 'MEDIA'} attached</div>}
            <div style={{fontSize:'.8rem', color:'#64748b'}}>👍 {p.likes_count || 0} • 💬 {p.comments_count || 0}</div>
          </div>)}
          {!communityPosts.length && <div className='list-row'><span>{t('No community posts yet.','Aucune publication communautaire pour le moment.')}</span></div>}
        </div>
      </article>

      <article className='panel' style={{marginTop:10}}>
        <div className='list-row' style={{marginBottom:8}}>
          <h3 style={{margin:0}}>💱 {t('Global Currency Converter (Realtime)','Convertisseur de devises mondial (temps réel)','全球货币转换器（实时）')}</h3>
          <button className='btn' onClick={()=>setShowCurrencyConverter(v=>!v)}>{showCurrencyConverter ? t('Hide','Masquer') : t('Show','Afficher')}</button>
        </div>
        {showCurrencyConverter && <>
        <div className='inlineForm'>
          <input className='input' type='number' step='any' min='0' value={fxAmount} onChange={(e)=>setFxAmount(e.target.value)} placeholder={t('Amount','Montant')} />
          <select className='input' value={fxBase} onChange={(e)=>setFxBase(e.target.value)}>
            {Object.keys(fxRates || {}).sort().map((c)=><option key={c} value={c}>{c} — {currencyName(c)}</option>)}
            {!Object.keys(fxRates || {}).length && <option value='USD'>USD</option>}
          </select>
          <input className='input' value={fxQuery} onChange={(e)=>setFxQuery(e.target.value)} placeholder={t('Filter currency (e.g., GHS, NGN, EUR)','Filtrer devise (ex: GHS, NGN, EUR)')} />
        </div>
        <div className='tabs' style={{marginBottom:8, flexWrap:'wrap'}}>
          {favoriteCurrencies.map((c)=>(
            <button key={`fav-pub-${c}`} className='tab' onClick={()=>setFxQuery(c)}>{c}</button>
          ))}
          <button className='tab' onClick={()=>setFxQuery('')}>{t('All','Tout')}</button>
        </div>
        <p style={{fontSize:'.82rem',color:'#64748b',margin:'6px 0 10px'}}>{t('Rates source','Source des taux')}: open.er-api.com • {t('Last updated','Dernière mise à jour')}: {fxUpdatedAt || '—'}</p>
        <div className='list' style={{maxHeight:320, overflow:'auto'}}>
          {fxRows.map((r)=>{
            const formatted = Number.isFinite(r.value) ? r.value.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '0'
            return <div className='list-row' key={`pub-fx-${r.code}`}><span>{r.code} — {r.name}</span><strong>{formatted}</strong></div>
          })}
          {!fxRows.length && <div className='list-row'><span>{t('No rates available right now.','Aucun taux disponible pour le moment.')}</span></div>}
        </div>
        </>}
      </article>

      <article className='panel' style={{marginTop:10}}>
        <div className='list-row' style={{marginBottom:8}}>
          <h3 style={{margin:0}}>📏 {t('Farmer Unit Converter','Convertisseur d’unités agricoles','农户单位换算器')}</h3>
          <button className='btn' onClick={()=>setShowUnitConverter(v=>!v)}>{showUnitConverter ? t('Hide','Masquer') : t('Show','Afficher')}</button>
        </div>
        {showUnitConverter && <>
        <div className='inlineForm'>
          <input className='input' type='number' step='any' value={unitValue} onChange={(e)=>setUnitValue(e.target.value)} placeholder={t('Value','Valeur')} />
          <select className='input' value={unitFrom} onChange={(e)=>setUnitFrom(e.target.value)}>
            {unitCodes.map((code)=><option key={`from-${code}`} value={code}>{unitDefs[code].label}</option>)}
          </select>
          <select className='input' value={unitTo} onChange={(e)=>setUnitTo(e.target.value)}>
            {unitCodes.map((code)=><option key={`to-${code}`} value={code}>{unitDefs[code].label}</option>)}
          </select>
        </div>
        <div className='list'>
          {unitDefs[unitFrom]?.type !== unitDefs[unitTo]?.type ? (
            <div className='list-row'><span>{t('Please choose units of the same type (length/area/weight).','Veuillez choisir des unités du même type (longueur/surface/poids).')}</span></div>
          ) : (
            <div className='list-row'>
              <span>{unitValue || 0} {unitFrom} =</span>
              <strong>{convertedUnitValue === '' ? '—' : Number(convertedUnitValue).toLocaleString(undefined, { maximumFractionDigits: 6 })} {unitTo}</strong>
            </div>
          )}
        </div>
        <p style={{fontSize:'.82rem',color:'#64748b',marginTop:8}}>{t('Includes common farming units: meters, feet, kilometers, hectares, acres, grams, kilograms, pounds, and tons.','Inclut les unités agricoles courantes : mètres, pieds, kilomètres, hectares, acres, grammes, kilogrammes, livres et tonnes.')}</p>
        </>}
      </article>

      <article className='panel' style={{marginTop:10, fontSize:'.82rem', color:'#475569'}}>
        <strong>{t('Legal & Safety Notice','Avis juridique et sécurité')}</strong>
        <div style={{marginTop:6}}>{t('Information in marketplace, AI tools, weather, plant/pest insights, and community content is provided as guidance only and does not replace professional agronomy, veterinary, legal, or financial advice. Always verify locally before acting.','Les informations du marché, des outils IA, de la météo, des analyses plantes/ravageurs et du contenu communautaire sont fournies à titre indicatif et ne remplacent pas les conseils professionnels en agronomie, vétérinaire, juridique ou financier. Vérifiez toujours localement avant d’agir.','市场、AI工具、天气、植物/害虫洞察和社区内容仅供参考，不可替代农业、兽医、法律或金融专业意见。请在本地核实后再行动。')}</div>
      </article>

      <div className='panel' style={{marginTop:10, fontSize:'.84rem', color:'#475569', display:'flex', gap:14, flexWrap:'wrap'}}>
        <a href='/privacy-policy.html' target='_blank' rel='noreferrer'>Privacy Policy</a>
        <a href='/terms-of-service.html' target='_blank' rel='noreferrer'>Terms of Service</a>
        <a href='/refund-policy.html' target='_blank' rel='noreferrer'>Refund Policy</a>
      </div>
    </div>
  </div>

  return <>
    {showSplash && <div className='app-splash'>
      <div className='app-splash-inner'>
        <img src='/assets/farmsavior-logo.jpg' alt='FarmSavior' />
        <p>FarmSavior is loading…</p>
      </div>
    </div>}
    {isOffline && <div className='offline-overlay'>
      <div className='offline-inner'>
        <img src='/assets/farmsavior-logo.jpg' alt='FarmSavior' />
        <h3>No internet connection</h3>
        <p>Check your network and try again.</p>
      </div>
    </div>}
    <div className='layout'>
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
            <option value='en'>English</option><option value='fr'>Français</option><option value='zh'>中文</option>
          </select>
          <button className='btn btn-dark' onClick={() => setActive('home')}>{t('← Main Interface','← Interface principale','← 主界面')}</button>
          <button className='btn' onClick={() => setActive('products')}>{t('Products','Produits')}</button>
          <button className='btn' onClick={() => setActive('livestock')}>{t('Livestock','Élevage')}</button>
          <button className='btn' onClick={() => setActive('services')}>{t('Services','Services')}</button>
          <button className='btn' onClick={() => setActive('ai-disease')}>{t('AI Disease','IA maladies')}</button>
          <button className='btn' onClick={() => setActive('plant-id')}>{t('Plant ID','ID plante')}</button>
          <button className='btn' onClick={() => setActive('pest-id')}>{t('Pest ID','ID ravageurs')}</button>
        </div>
        <div style={{display:'flex', gap:8}}>
          <button className='btn btn-dark' onClick={() => setActive('onboarding')}>{t('My Account','Mon compte')}</button>
          <button className='btn' onClick={goToPublicHomepage}>{t('Public Homepage','Page publique')}</button>
        </div>
      </div>
      <div className='panel' style={{marginBottom:10,fontSize:'.8rem',color:'#475569'}}>
        {t('Legal/Safety: AI and market outputs are informational. Always verify diagnosis, dosage, legal approvals, and withdrawal periods with local professionals before action.','Juridique/Sécurité : les résultats IA et marché sont informatifs. Vérifiez toujours diagnostic, dosage, autorisations légales et délais d’attente avec des professionnels locaux avant action.')}
      </div>
      {active === 'home' && <section>
        <h2>{t('Main App Homepage','Page d’accueil de l’application')}</h2>
        <form className='inlineForm' onSubmit={(e) => { e.preventDefault(); addRecentSearch(homeQuery) }}>
          <input className='input' placeholder={t('Search products, livestock, services…','Rechercher produits, élevage, services…')} value={homeQuery} onChange={(e)=>setHomeQuery(e.target.value)} />
          <button className='btn btn-dark' type='submit'>{t('Search','Rechercher','搜索')}</button>
        </form>
        <div className='two-col'>
          <article className='panel'>
            <h3>{t('Search Results','Résultats de recherche','搜索结果')}</h3>
            <div className='list'>
              {[...state.listings.map(x=>({type:'Product', id:x.id, name:x.crop_name, price:x.unit_price})), ...state.livestock.map(x=>({type:'Livestock', id:x.id, name:x.livestock_type, price:x.unit_price})), ...state.logistics.map(x=>({type:'Service', id:x.id, name:`${x.pickup_location} → ${x.dropoff_location}`, price:''}))]
                .filter(x => !homeQuery || `${x.type} ${x.name}`.toLowerCase().includes(homeQuery.toLowerCase()))
                .slice(0,20)
                .map((x,i)=><div className='list-row' key={`${x.type}-${x.id}-${i}`}><span>{x.type}: {x.name}</span><span>{x.price ? `₵${x.price}` : ''}</span></div>)}
            </div>
          </article>
          <article className='panel'>
            <h3>{t('Recents','Récents','最近')}</h3>
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
          <div className='list-row'>
            <h3 style={{margin:0}}>{t('🌍 Global World Chat','🌍 Chat mondial','🌍 全球世界聊天')}</h3>
            <button type='button' className='btn btn-dark' onClick={() => handleProtectedAction('world-chat', 'Global World Chat')}>{t('Open World Chat','Ouvrir le chat mondial','打开全球聊天')}</button>
          </div>
          <div className='list' style={{maxHeight:180, overflow:'auto'}}>
            {worldChat.slice(-6).map((m)=><div className='list-row' key={`home-wc-${m.id}`}><span><strong>{m.user_name || `User ${m.user_id}`}:</strong> {m.text}</span></div>)}
            {!worldChat.length && <div className='list-row'><span>No messages yet.</span></div>}
          </div>
        </article>

        <article className='panel' style={{marginTop:10}}>
          <div className='list-row'>
            <h3 style={{margin:0}}>{t('📸 FarmSavior Community','📸 Communauté FarmSavior','📸 FarmSavior 社区')}</h3>
            <button className='btn btn-dark' onClick={() => setActive('community')}>{t('Open Community','Ouvrir la communauté','打开社区')}</button>
          </div>

          <div style={{position:'relative', marginBottom:10}}>
            {isUserImage(communityProfile.cover_image_url)
              ? <img src={communityProfile.cover_image_url} alt='Community cover' style={{width:'100%',height:120,objectFit:'cover',borderRadius:10,border:'1px solid #e2e8f0'}} />
              : <div style={{width:'100%',height:120,borderRadius:10,border:'1px solid #e2e8f0',background:'#f1f5f9',display:'grid',placeItems:'center',color:'#64748b'}}>Upload your cover photo</div>}
            {isUserImage(communityProfile.avatar_url)
              ? <img src={communityProfile.avatar_url} alt='Community avatar' style={{position:'absolute',left:10,bottom:-22,width:56,height:56,objectFit:'cover',borderRadius:'50%',border:'3px solid #fff',boxShadow:'0 6px 12px rgba(0,0,0,.2)'}} />
              : <div style={{position:'absolute',left:10,bottom:-22,width:56,height:56,borderRadius:'50%',border:'3px solid #fff',background:'#e2e8f0',display:'grid',placeItems:'center',color:'#64748b',fontSize:11}}>No DP</div>}
            <div style={{position:'absolute',left:74,bottom:8,color:'#fff',fontWeight:700,textShadow:'0 1px 2px rgba(0,0,0,.6)'}}>{(me?.full_name || 'Your Community Profile') + (communityProfile.username ? ` • @${communityProfile.username}` : '')}</div>
          </div>

          <div className='list' style={{maxHeight:220, overflow:'auto', marginTop:26}}>
            {communityPosts.slice(0, 3).map((p)=><div key={`home-cp-${p.id}`} className='panel' style={{padding:8}}>
              <div style={{fontWeight:700}}>{p.author_name || `User ${p.user_id}`} {p.author_country ? `(${p.author_country})` : ''}</div>
              {!!p.text && <div style={{fontSize:'.9rem'}}>{String(p.text).slice(0, 140)}{String(p.text).length > 140 ? '…' : ''}</div>}
              {p.media_url && <div style={{fontSize:'.8rem', color:'#64748b'}}>{p.media_type || 'MEDIA'} attached</div>}
              <div style={{fontSize:'.8rem', color:'#64748b'}}>👍 {p.likes_count || 0} • 💬 {p.comments_count || 0}</div>
            </div>)}
            {!communityPosts.length && <div className='list-row'><span>No community posts yet.</span></div>}
          </div>
        </article>

        <article className='panel' style={{marginTop:10, fontSize:'.82rem', color:'#475569'}}>
          <strong>Legal & Safety Notice</strong>
          <div style={{marginTop:6}}>Market prices, AI outputs, weather, and community posts are informational. Verify crop/pest diagnosis, treatment labels, dosage, withdrawal periods, and local regulations with qualified professionals before action.</div>
        </article>

        <article className='panel' style={{marginTop:10}}>
          <div className='list-row' style={{marginBottom:8}}>
            <h3 style={{margin:0}}>{t('💱 Global Currency Converter (Realtime)','💱 Convertisseur de devises mondial (temps réel)','💱 全球货币转换器（实时）')}</h3>
            <button className='btn' onClick={()=>setShowCurrencyConverter(v=>!v)}>{showCurrencyConverter ? 'Hide' : 'Show'}</button>
          </div>
          {showCurrencyConverter && <>
          <div className='inlineForm'>
            <input className='input' type='number' step='any' min='0' value={fxAmount} onChange={(e)=>setFxAmount(e.target.value)} placeholder='Amount' />
            <select className='input' value={fxBase} onChange={(e)=>setFxBase(e.target.value)}>
              {Object.keys(fxRates || {}).sort().map((c)=><option key={c} value={c}>{c} — {currencyName(c)}</option>)}
              {!Object.keys(fxRates || {}).length && <option value='USD'>USD</option>}
            </select>
            <input className='input' value={fxQuery} onChange={(e)=>setFxQuery(e.target.value)} placeholder='Filter currency (e.g., GHS, NGN, EUR)' />
          </div>
          <div className='tabs' style={{marginBottom:8, flexWrap:'wrap'}}>
            {favoriteCurrencies.map((c)=>(
              <button key={`fav-app-${c}`} className='tab' onClick={()=>setFxQuery(c)}>{c}</button>
            ))}
            <button className='tab' onClick={()=>setFxQuery('')}>All</button>
          </div>
          <p style={{fontSize:'.82rem',color:'#64748b',margin:'6px 0 10px'}}>Rates source: open.er-api.com • Last updated: {fxUpdatedAt || '—'}</p>
          <div className='list' style={{maxHeight:320, overflow:'auto'}}>
            {fxRows.map((r)=>{
              const formatted = Number.isFinite(r.value) ? r.value.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '0'
              return <div className='list-row' key={r.code}><span>{r.code} — {r.name}</span><strong>{formatted}</strong></div>
            })}
            {!fxRows.length && <div className='list-row'><span>No rates available right now.</span></div>}
          </div>
          </>}
        </article>

        <article className='panel' style={{marginTop:10}}>
          <div className='list-row' style={{marginBottom:8}}>
            <h3 style={{margin:0}}>{t('📏 Farmer Unit Converter','📏 Convertisseur d’unités agriculteur','📏 农户单位换算器')}</h3>
            <button className='btn' onClick={()=>setShowUnitConverter(v=>!v)}>{showUnitConverter ? 'Hide' : 'Show'}</button>
          </div>
          {showUnitConverter && <>
          <div className='inlineForm'>
            <input className='input' type='number' step='any' value={unitValue} onChange={(e)=>setUnitValue(e.target.value)} placeholder='Value' />
            <select className='input' value={unitFrom} onChange={(e)=>setUnitFrom(e.target.value)}>
              {unitCodes.map((code)=><option key={`app-from-${code}`} value={code}>{unitDefs[code].label}</option>)}
            </select>
            <select className='input' value={unitTo} onChange={(e)=>setUnitTo(e.target.value)}>
              {unitCodes.map((code)=><option key={`app-to-${code}`} value={code}>{unitDefs[code].label}</option>)}
            </select>
          </div>
          <div className='list'>
            {unitDefs[unitFrom]?.type !== unitDefs[unitTo]?.type ? (
              <div className='list-row'><span>Please choose units of the same type (length/area/weight).</span></div>
            ) : (
              <div className='list-row'>
                <span>{unitValue || 0} {unitFrom} =</span>
                <strong>{convertedUnitValue === '' ? '—' : Number(convertedUnitValue).toLocaleString(undefined, { maximumFractionDigits: 6 })} {unitTo}</strong>
              </div>
            )}
          </div>
          </>}
        </article>
      </section>}

      {active === 'dashboard' && <section>
        <h2>{t('Admin Dashboard + Analytics','Tableau de bord admin + analyses','管理员仪表盘 + 分析')}</h2>
        <div className='kpi-grid'>{kpis.map(([k, v]) => <article className='kpi-card' key={k}><p>{k}</p><strong>{v}</strong></article>)}</div>

        <div className='two-col'>
          <article className='panel'>
            <h3>{t('Crop Supply Forecasts','Prévisions d’approvisionnement des cultures','作物供应预测')}</h3>
            <div className='list-row'><span>Total Crop Listings</span><strong>{state.listings.length}</strong></div>
            <div className='list-row'><span>Estimated Supply (kg)</span><strong>{state.listings.reduce((s,x)=>s+Number(x.quantity_kg||0),0).toFixed(0)}</strong></div>
            <div className='list-row'><span>30-day Outlook</span><strong>{state.listings.length > 5 ? 'High' : 'Moderate'}</strong></div>
          </article>
          <article className='panel'>
            <h3>{t('Regional Production Data','Données de production régionales','区域生产数据')}</h3>
            {['GH','NG','BF'].map(c => {
              const count = state.listings.filter(x => x.country === c).length
              return <div className='list-row' key={c}><span>{c}</span><strong>{count} listings</strong></div>
            })}
          </article>
        </div>

        <div className='two-col' style={{marginTop:10}}>
          <article className='panel'>
            <h3>{t('Market Price Trends','Tendances des prix du marché','市场价格趋势')}</h3>
            <div className='list-row'><span>Avg Crop Unit Price</span><strong>{(state.listings.reduce((s,x)=>s+Number(x.unit_price||0),0) / Math.max(state.listings.length,1)).toFixed(2)}</strong></div>
            <div className='list-row'><span>Avg Livestock Unit Price</span><strong>{(state.livestock.reduce((s,x)=>s+Number(x.unit_price||0),0) / Math.max(state.livestock.length,1)).toFixed(2)}</strong></div>
          </article>
          <article className='panel'>
            <h3>{t('Logistics Activity + Farmer Growth','Activité logistique + croissance des agriculteurs','物流活动 + 农户增长')}</h3>
            <div className='list-row'><span>Active Logistics Requests</span><strong>{state.logistics.length}</strong></div>
            <div className='list-row'><span>Farmer Profiles</span><strong>{state.users.filter(u => (u.role||'') === 'Farmer').length}</strong></div>
            <div className='list-row'><span>Growth Signal</span><strong>{state.users.length > 5 ? 'Growing' : 'Early Stage'}</strong></div>
          </article>
        </div>

        <DataTable columns={['id', 'full_name', 'phone', 'country', 'region', 'role']} rows={state.users} filterKey='full_name' />
      </section>}

      {active === 'onboarding' && <section>
        <div className='two-col' style={{marginBottom:12}}>
          <article className='panel'>
            <h3>{t('My Account','Mon compte','我的账户')}</h3>
            <form className='list' onSubmit={async e => {
              e.preventDefault()
              try {
                const updated = await api.updateMe(accountForm)
                setMe(updated)
                alert('Profile updated successfully.')
              } catch (e) { alert(errMsg(e)) }
            }}>
              <input className='input' placeholder='Full name' value={accountForm.full_name} onChange={e => setAccountForm({ ...accountForm, full_name: e.target.value })} />
              <input className='input' placeholder='Region' value={accountForm.region} onChange={e => setAccountForm({ ...accountForm, region: e.target.value })} />
              <input className='input' value={me?.phone || ''} disabled />
              <div style={{fontSize:'.78rem',color:'#64748b'}}>Phone changes require OTP re-verification (coming next).</div>
              <button className='btn btn-dark'>Save Profile</button>
            </form>
            <hr style={{border:'none',borderTop:'1px solid #e2e8f0', margin:'10px 0'}} />
            <form className='list' onSubmit={async e => {
              e.preventDefault()
              try {
                await api.changePassword(passwordForm)
                setPasswordForm({ current_password: '', new_password: '' })
                alert('Password changed successfully.')
              } catch (e) { alert(errMsg(e)) }
            }}>
              <input className='input' type='password' placeholder='Current password' value={passwordForm.current_password} onChange={e => setPasswordForm({ ...passwordForm, current_password: e.target.value })} />
              <input className='input' type='password' placeholder='New password (min 6 chars)' value={passwordForm.new_password} onChange={e => setPasswordForm({ ...passwordForm, new_password: e.target.value })} />
              <button className='btn'>Change Password</button>
            </form>
            <hr style={{border:'none',borderTop:'1px solid #e2e8f0', margin:'10px 0'}} />
            <form className='list' onSubmit={async e => {
              e.preventDefault()
              const ok = window.confirm('Are you sure? This will permanently disable this account.')
              if (!ok) return
              try {
                await api.deleteAccount(deleteAccountForm)
                localStorage.removeItem('farmsavior_token')
                setToken('')
                setDeleteAccountForm({ current_password: '' })
                alert('Your account has been deleted.')
                window.location.href='/?public=1'
              } catch (e) { alert(errMsg(e)) }
            }}>
              <input className='input' type='password' placeholder='Confirm current password to delete account' value={deleteAccountForm.current_password} onChange={e => setDeleteAccountForm({ current_password: e.target.value })} />
              <button className='btn' style={{background:'#7f1d1d', color:'#fff', borderColor:'#7f1d1d'}}>Delete Account</button>
            </form>
          </article>

          <article className='panel'>
            <h3>{t('My Verification Status','Mon statut de vérification','我的认证状态')}</h3>
            <div className='list'>
              <div className='list-row'><span>Current status</span><strong>{myIdVerification?.review?.status || 'NOT_SUBMITTED'}</strong></div>
              <div className='list-row'><span>ID type</span><strong>{myIdVerification?.application?.id_type || '-'}</strong></div>
              <div className='list-row'><span>Reviewed at</span><strong>{String(myIdVerification?.review?.reviewed_at || '-').slice(0, 16)}</strong></div>
            </div>
            <form className='list' onSubmit={async e => {
              e.preventDefault()
              if (!myIdForm.id_front_photo_url || !myIdForm.id_back_photo_url) { alert('Please upload front and back ID photos from your phone/camera.'); return }
              try {
                await api.submitMyIdVerification(myIdForm)
                alert('Verification update submitted. Status set to PENDING re-review.')
                await load()
              } catch (e) { alert(errMsg(e)) }
            }}>
              <select className='input' value={myIdForm.id_type} onChange={e => setMyIdForm({ ...myIdForm, id_type: e.target.value })}><option>GhanaCard</option><option>NIN</option><option>BF National ID</option></select>
              <input className='input' placeholder='ID Number' value={myIdForm.id_number} onChange={e => setMyIdForm({ ...myIdForm, id_number: e.target.value })} />
              <label style={{fontSize:'.84rem'}}>Upload ID Front (camera/gallery)
                <input className='input' type='file' accept='image/*' capture='environment' onChange={(e) => {
                  const f = e.target.files?.[0]; if (!f) return
                  const r = new FileReader(); r.onload = () => setMyIdForm(prev => ({ ...prev, id_front_photo_url: String(r.result || ''), id_photo_url: String(r.result || '') })); r.readAsDataURL(f)
                }} />
              </label>
              <label style={{fontSize:'.84rem'}}>Upload ID Back (camera/gallery)
                <input className='input' type='file' accept='image/*' capture='environment' onChange={(e) => {
                  const f = e.target.files?.[0]; if (!f) return
                  const r = new FileReader(); r.onload = () => setMyIdForm(prev => ({ ...prev, id_back_photo_url: String(r.result || '') })); r.readAsDataURL(f)
                }} />
              </label>
              <label><input type='checkbox' checked={myIdForm.facial_verification_flag} onChange={e => setMyIdForm({ ...myIdForm, facial_verification_flag: e.target.checked })} /> Facial verification done</label>
              <button className='btn btn-dark'>Submit Verification Update</button>
            </form>
            <div style={{fontSize:'.78rem',color:'#64748b',marginTop:6}}>If you update ID details after approval, your verification goes through re-review for safety.</div>
          </article>
        </div>

        <div className='two-col'>
          <article className='panel'><h3>{t('ID Verification','Vérification d’identité','身份认证')}</h3><form className='list' onSubmit={async e => { e.preventDefault(); if (!idForm.id_front_photo_url || !idForm.id_back_photo_url) { alert('Please upload front and back ID photos from your phone/camera.'); return } await api.createIdVerification({ ...idForm, user_id: Number(idForm.user_id) }); await load() }}>
            <input className='input' type='number' placeholder='User ID' value={idForm.user_id} onChange={e => setIdForm({ ...idForm, user_id: e.target.value })} />
            <select className='input' value={idForm.id_type} onChange={e => setIdForm({ ...idForm, id_type: e.target.value })}><option>GhanaCard</option><option>NIN</option><option>BF National ID</option></select>
            <input className='input' placeholder='ID Number' value={idForm.id_number} onChange={e => setIdForm({ ...idForm, id_number: e.target.value })} />
            <label style={{fontSize:'.84rem'}}>Upload ID Front (camera/gallery)
              <input className='input' type='file' accept='image/*' capture='environment' onChange={(e) => {
                const f = e.target.files?.[0]; if (!f) return
                const r = new FileReader(); r.onload = () => setIdForm(prev => ({ ...prev, id_front_photo_url: String(r.result || ''), id_photo_url: String(r.result || '') })); r.readAsDataURL(f)
              }} />
            </label>
            <label style={{fontSize:'.84rem'}}>Upload ID Back (camera/gallery)
              <input className='input' type='file' accept='image/*' capture='environment' onChange={(e) => {
                const f = e.target.files?.[0]; if (!f) return
                const r = new FileReader(); r.onload = () => setIdForm(prev => ({ ...prev, id_back_photo_url: String(r.result || '') })); r.readAsDataURL(f)
              }} />
            </label>
            <label><input type='checkbox' checked={idForm.facial_verification_flag} onChange={e => setIdForm({ ...idForm, facial_verification_flag: e.target.checked })} /> Facial verification done</label>
            <button className='btn btn-dark'>Save ID Verification</button>
          </form></article>
          <article className='panel'><h3>{t('Digital Farm Passport','Passeport agricole numérique','数字农场护照')}</h3><form className='list' onSubmit={async e => { e.preventDefault(); await api.createPassport({ ...passportForm, user_id: Number(passportForm.user_id), gps_lat: Number(passportForm.gps_lat), gps_lng: Number(passportForm.gps_lng), farm_size_hectares: Number(passportForm.farm_size_hectares) }); await load() }}>
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

        {((me?.role || '').toLowerCase() === 'admin') && <article className='panel' style={{marginTop: 12}}>
          <div className='panelHeadActions'>
            <h3>{t('Verification Applications','Demandes de vérification','认证申请')}</h3>
            <button className='btn btn-dark' onClick={async () => { await api.analyzeAllVerifications(); await load(); }}>AI Analyze & Decide All</button>
          </div>
          <DataTable columns={['id_verification_id','full_name','phone','country','id_type','status','ai_score','ai_reason']} rows={state.verificationApps} filterKey='full_name' />
          <div className='inlineForm'>
            <input id='verifyAppId' className='input' placeholder='Application ID' />
            <button className='btn btn-dark' onClick={async ()=>{ const id=Number(document.getElementById('verifyAppId').value); if(id){ await api.analyzeVerification(id); await load(); }}}>Analyze One</button>
            <button className='btn btn-dark' onClick={async ()=>{ const id=Number(document.getElementById('verifyAppId').value); if(id){ await api.setVerificationDecision(id,{status:'APPROVED'}); await load(); }}}>Approve</button>
            <button className='btn btn-dark' onClick={async ()=>{ const id=Number(document.getElementById('verifyAppId').value); if(id){ await api.setVerificationDecision(id,{status:'DENIED'}); await load(); }}}>Deny</button>
          </div>
        </article>}

        {((me?.role || '').toLowerCase() === 'admin') && <article className='panel' style={{marginTop: 12}}>
          <h3>{t('Verified Accounts (Approved)','Comptes vérifiés (approuvés)','已认证账户（已批准）')}</h3>
          <DataTable columns={['user_id','full_name','phone','country','role','verified_status','ai_score']} rows={state.approvedAccounts} filterKey='full_name' />
        </article>}
      </section>}

      {active === 'products' && <section><h3>{t('Product Listings','Annonces de produits','产品列表')}</h3><form className='inlineForm' onSubmit={async e => { e.preventDefault(); await api.createListing({ ...cropForm, farmer_id: Number(cropForm.farmer_id), quantity_kg: Number(cropForm.quantity_kg), unit_price: Number(cropForm.unit_price) }); await load() }}>
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

      {active === 'livestock' && <section><h3>{t('Livestock Listings','Annonces de bétail','牲畜列表')}</h3><form className='inlineForm' onSubmit={async e => { e.preventDefault(); await api.createLivestock({ ...livestockForm, farmer_id: Number(livestockForm.farmer_id), quantity: Number(livestockForm.quantity), unit_price: Number(livestockForm.unit_price) }); await load() }}>
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

      {active === 'services' && <section><h3>{t('Services','Services','服务')}</h3>
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

      {active === 'payments' && <section><h3>{t('Payments + Escrow','Paiements + séquestre','支付 + 托管')}</h3><form className='inlineForm' onSubmit={async e => { e.preventDefault(); await api.createPayment({ ...paymentForm, payer_id: Number(paymentForm.payer_id), payee_id: Number(paymentForm.payee_id), amount: Number(paymentForm.amount) }); await load() }}>
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

      {active === 'alerts' && <section><h3>{t('Weather Alerts (GH • NG • BF)','Alertes météo (GH • NG • BF)','天气预警（GH • NG • BF）')}</h3>
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

      {active === 'maps' && <section><h3>{t('Map System (Google Maps) + Farm GPS Mapping','Système de carte (Google Maps) + cartographie GPS des fermes','地图系统（Google 地图）+ 农场 GPS 标注')}</h3>
        <div className='inlineForm'>
          <select className='input' value={mapCountry} onChange={(e)=>{ setMapCountry(e.target.value); setMapPolygonPoints([]) }}>
            <option value='GH'>Ghana</option><option value='NG'>Nigeria</option><option value='BF'>Burkina Faso</option>
          </select>
          <input className='input' placeholder='Point (lat,lng) from Google Maps' value={mapPointInput} onChange={(e)=>setMapPointInput(e.target.value)} />
          <button type='button' className='btn' onClick={addPointFromInput}>Add Point</button>
          <button className='btn btn-dark' onClick={() => window.open('https://maps.google.com', '_blank')}>Open Google Maps</button>
        </div>
        <div className='panel'>
          <div style={{position:'relative'}}>
            <iframe title={`${mapCountry} map`} width='100%' height='320' style={{border:0, borderRadius:10}} loading='lazy' src={`https://maps.google.com/maps?q=${mapCountry === 'GH' ? 'Ghana' : mapCountry === 'NG' ? 'Nigeria' : 'Burkina Faso'}&z=6&output=embed`} />
            <div
              role='button'
              title='Tap to add boundary points'
              onClick={onMapOverlayClick}
              style={{position:'absolute', inset:0, cursor:'crosshair', background:'rgba(2,132,199,0.06)', borderRadius:10}}
            />
          </div>
          <p style={{fontSize:'.85rem', color:'#64748b', marginTop:8}}>Tap map or paste one coordinate in a single field (lat,lng), then add next point. When done, click “Close Area & Use”.</p>
          <div className='inlineForm'>
            <button type='button' className='btn' onClick={()=>setMapPolygonPoints([])}>Clear Points</button>
            <button type='button' className='btn' onClick={()=>setMapPolygonPoints(prev => prev.slice(0, -1))}>Undo Last</button>
            <button type='button' className='btn btn-dark' disabled={mapPolygonPoints.length < 3} onClick={applyPolygonToFarmForm}>Close Area & Use</button>
          </div>
          <div style={{fontSize:'.82rem', color:'#475569'}}>Points: {mapPolygonPoints.length} {mapPolygonPoints.length > 0 ? `• Est. Area: ${polygonAreaHectares(mapPolygonPoints).toFixed(2)} ha` : ''}</div>
          {mapPolygonPoints.length > 0 && <div style={{fontSize:'.78rem', color:'#64748b', maxHeight:80, overflow:'auto', marginTop:4}}>{mapPolygonPoints.map((p, i)=>`#${i+1} (${p.lat}, ${p.lng})`).join('  |  ')}</div>}
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
          <input className='input' placeholder='Selected point (lat,lng)' value={farmMapForm.gps_lat && farmMapForm.gps_lng ? `${farmMapForm.gps_lat}, ${farmMapForm.gps_lng}` : ''} readOnly required />
          <input className='input' placeholder='Farm size (hectares)' value={farmMapForm.farm_size_hectares} onChange={(e)=>setFarmMapForm({...farmMapForm,farm_size_hectares:e.target.value})} required />
          <input className='input' placeholder='Farm photos URLs JSON array' value={farmMapForm.farm_photo_urls} onChange={(e)=>setFarmMapForm({...farmMapForm,farm_photo_urls:e.target.value})} />
          <button className='btn btn-dark'>Save Farm GPS</button>
        </form>
      </section>}

      {active === 'messaging' && <section><h3>{t('Messaging (Firebase Cloud Messaging)','Messagerie (Firebase Cloud Messaging)','消息（Firebase 云消息）')}</h3>
        <form className='inlineForm' onSubmit={async e => { e.preventDefault(); await api.registerDeviceToken({ user_id: 1, platform: 'web', token: fcmToken }); setFcmToken(''); await load(); }}>
          <input className='input' placeholder='FCM device token' value={fcmToken} onChange={(e)=>setFcmToken(e.target.value)} required />
          <button className='btn btn-dark'>Register Device Token</button>
        </form>
        <DataTable columns={['id','user_id','platform','token','created_at']} rows={state.deviceTokens} filterKey='platform' />
      </section>}

      {active === 'world-chat' && <section>
        <h3>{t('🌍 Global Farmers World Chat (AI Moderated)','🌍 Chat mondial des agriculteurs (modéré par IA)','🌍 全球农民世界聊天（AI 审核）')}</h3>
        <form className='inlineForm' onSubmit={async e => {
          e.preventDefault()
          try {
            if (!worldChatText.trim()) { setWorldChatMsg('Type a message first.'); return }
            setWorldChatMsg('Sending...')
            const r = await api.postWorldChatMessage({ text: worldChatText })
            setWorldChatText('')
            if (r.status !== 'VISIBLE') {
              setWorldChatMsg(`Message held by safety filter: ${r.moderation_reason || 'review required'}`)
            } else {
              setWorldChatMsg('Message posted successfully')
            }
            await loadWorldChat()
            if ((me?.role || '').toLowerCase() === 'admin') await loadWorldChatQueue()
          } catch (e) {
            const msg = errMsg(e)
            if (String(msg).toLowerCase().includes('user not found') || String(msg).toLowerCase().includes('missing bearer token')) {
              setWorldChatMsg('Session expired. Please sign in again, then resend your message.')
              setToken('')
              setAuthMode('login')
            } else {
              setWorldChatMsg(`Send failed: ${msg}`)
            }
          }
        }}>
          <input className='input' placeholder='Share with farmers worldwide…' value={worldChatText} onChange={(e)=>setWorldChatText(e.target.value)} maxLength={900} />
          <button type='submit' className='btn btn-dark' disabled={!worldChatText.trim()}>Send</button>
        </form>
        {worldChatMsg && <p style={{fontSize:'.85rem',color:'#475569'}}>{worldChatMsg}</p>}

        <article className='panel'>
          <h4>{t('Live Global Feed','Flux mondial en direct','全球实时动态')}</h4>
          <div className='list' style={{maxHeight:420, overflow:'auto'}}>
            {worldChat.map((m) => (
              <div className='list-row' key={`wc-${m.id}`} style={{alignItems:'flex-start'}}>
                <div>
                  <div style={{fontWeight:700}}>{m.user_name || `User ${m.user_id}`} {m.user_country ? `(${m.user_country})` : ''}</div>
                  <div style={{whiteSpace:'pre-wrap'}}>{m.text}</div>
                </div>
                <span style={{fontSize:'.75rem',color:'#64748b'}}>{String(m.created_at || '').replace('T',' ').slice(0,16)}</span>
              </div>
            ))}
            {!worldChat.length && <div className='list-row'><span>No world chat messages yet.</span></div>}
          </div>
        </article>

        {(me?.role || '').toLowerCase() === 'admin' && <article className='panel' style={{marginTop:10}}>
          <h4>{t('Moderation Queue','File de modération','审核队列')}</h4>
          <div className='list' style={{maxHeight:360, overflow:'auto'}}>
            {worldChatQueue.map((q) => (
              <div key={`wq-${q.id}`} className='panel' style={{padding:10, marginBottom:8}}>
                <div style={{fontWeight:700, marginBottom:4}}>#{q.id} • {q.user_name || `User ${q.user_id}`} • {q.moderation_label}</div>
                <div style={{fontSize:'.86rem', color:'#475569', marginBottom:6}}>{q.text}</div>
                <div style={{fontSize:'.78rem', color:'#64748b', marginBottom:6}}>Reason: {q.moderation_reason || '-'} | Score: {Number(q.moderation_score || 0).toFixed(2)}</div>
                <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                  <button className='btn' onClick={async()=>{ await api.setWorldChatModerationAction({ message_id:q.id, action:'approve' }); await loadWorldChatQueue(); await loadWorldChat(); }}>Approve</button>
                  <button className='btn' onClick={async()=>{ await api.setWorldChatModerationAction({ message_id:q.id, action:'hide' }); await loadWorldChatQueue(); }}>Hide</button>
                  <button className='btn' onClick={async()=>{ await api.setWorldChatModerationAction({ message_id:q.id, action:'delete', reason:'Removed by admin' }); await loadWorldChatQueue(); }}>Delete</button>
                  <button className='btn' onClick={async()=>{ await api.sanctionWorldChatUser(q.user_id, { mute_minutes: 30, reason: 'World chat abuse' }); await loadWorldChatQueue(); }}>Mute 30m</button>
                  <button className='btn' onClick={async()=>{ await api.sanctionWorldChatUser(q.user_id, { ban: true, reason: 'Severe abuse' }); await loadWorldChatQueue(); }}>Ban user</button>
                </div>
              </div>
            ))}
            {!worldChatQueue.length && <div className='list-row'><span>No flagged messages.</span></div>}
          </div>
        </article>}
      </section>}

      {active === 'community' && <section>
        <div className='panel' style={{background:'linear-gradient(120deg,#065f46,#0ea5e9)', color:'#fff', marginBottom:10, position:'relative', overflow:'hidden'}}>
          <div style={{position:'absolute', right:-20, top:-20, width:120, height:120, borderRadius:'50%', background:'rgba(255,255,255,.18)'}} />
          <div style={{position:'absolute', right:60, bottom:-36, width:100, height:100, borderRadius:'50%', background:'rgba(255,255,255,.12)'}} />
          <h3 style={{marginTop:0, position:'relative'}}>{t('📸 FarmSavior Community','📸 Communauté FarmSavior','📸 FarmSavior 社区')}</h3>
          <p style={{margin:0, opacity:.95, position:'relative'}}>Share farm life, innovations, products, and short videos with growers worldwide.</p>
          <div className='tabs' style={{marginTop:10, position:'relative'}}>
            <span className='tab active'>🔥 Trending</span>
            <span className='tab'>🎥 Reels</span>
            <span className='tab'>🌱 Tips</span>
            <span className='tab'>🛒 Products</span>
          </div>
        </div>

        <article className='panel' style={{marginBottom:10}}>
          <h4 style={{marginTop:0}}>Stories</h4>
          <div style={{display:'flex', gap:10, overflowX:'auto', paddingBottom:4}}>
            {communityPosts.filter(p => isUserImage(p.media_url)).slice(0,8).map((p, i) => (
              <div key={`story-${i}`} style={{minWidth:74,textAlign:'center'}}>
                <div style={{width:64,height:64,padding:2,borderRadius:'50%',background:'linear-gradient(45deg,#16a34a,#0ea5e9,#f97316)',margin:'0 auto'}}>
                  <img src={p.media_url} alt='story' style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%',border:'2px solid #fff'}} />
                </div>
                <div style={{fontSize:11,color:'#475569',marginTop:4}}>Farmer {i+1}</div>
              </div>
            ))}
          </div>
        </article>

        <div className='two-col'>
          <article className='panel'>
            <h4>{t('My Community Profile','Mon profil communautaire','我的社区资料')}</h4>
            <div style={{position:'relative', marginBottom:12}}>
              {isUserImage(communityProfile.cover_image_url)
                ? <img src={communityProfile.cover_image_url} alt='Cover' style={{width:'100%',height:170,objectFit:'cover',borderRadius:12,border:'1px solid #e2e8f0'}} />
                : <div style={{width:'100%',height:170,borderRadius:12,border:'1px solid #e2e8f0',background:'#f1f5f9',display:'grid',placeItems:'center',color:'#64748b'}}>Upload your cover image</div>}
              <div style={{position:'absolute',inset:0,borderRadius:12,background:'linear-gradient(180deg,rgba(15,23,42,0) 30%, rgba(15,23,42,.35) 100%)'}} />
              {isUserImage(communityProfile.avatar_url)
                ? <img src={communityProfile.avatar_url} alt='Avatar' style={{position:'absolute',left:14,bottom:-26,width:86,height:86,objectFit:'cover',borderRadius:'50%',border:'4px solid #fff',boxShadow:'0 8px 20px rgba(0,0,0,.22)'}} />
                : <div style={{position:'absolute',left:14,bottom:-26,width:86,height:86,borderRadius:'50%',border:'4px solid #fff',background:'#e2e8f0',display:'grid',placeItems:'center',color:'#64748b'}}>No DP</div>}
            </div>
            <div style={{paddingLeft:4, marginTop:28, marginBottom:8}}>
              <div style={{fontSize:'1rem',fontWeight:700,color:'#0f172a'}}>{me?.full_name || 'Your profile'}</div>
              <div style={{fontSize:'.82rem',color:'#0284c7',fontWeight:600}}>@{communityProfile.username || 'set_username'}</div>
              <div style={{fontSize:'.85rem',color:'#475569'}}>{communityProfile.bio || 'Add a short bio to attract followers.'}</div>
            </div>
            <form className='list' onSubmit={async(e)=>{e.preventDefault(); await api.saveCommunityProfileMe(communityProfile); await loadCommunity(); alert('Profile updated')}}>
              <label style={{fontSize:'.85rem',color:'#475569'}}>Display picture</label>
              <input className='input' type='file' accept='image/*' onChange={(e)=>{
                const f = e.target.files?.[0]
                if (!f) return
                const reader = new FileReader()
                reader.onload = () => setCommunityProfile(prev => ({ ...prev, avatar_url: String(reader.result || '') }))
                reader.readAsDataURL(f)
              }} />

              <label style={{fontSize:'.85rem',color:'#475569'}}>Cover image</label>
              <input className='input' type='file' accept='image/*' onChange={(e)=>{
                const f = e.target.files?.[0]
                if (!f) return
                const reader = new FileReader()
                reader.onload = () => setCommunityProfile(prev => ({ ...prev, cover_image_url: String(reader.result || '') }))
                reader.readAsDataURL(f)
              }} />
              <input className='input' placeholder='Username (e.g. akhen_farmer)' value={communityProfile.username || ''} onChange={(e)=>setCommunityProfile({...communityProfile, username:e.target.value.toLowerCase().replace(/\s+/g,'')})} />
              <input className='input' placeholder='Bio' value={communityProfile.bio || ''} onChange={(e)=>setCommunityProfile({...communityProfile, bio:e.target.value})} />
              <input className='input' placeholder='Farm life details' value={communityProfile.farm_life || ''} onChange={(e)=>setCommunityProfile({...communityProfile, farm_life:e.target.value})} />
              <input className='input' placeholder='Interests/tags (comma separated)' value={communityProfile.interests || ''} onChange={(e)=>setCommunityProfile({...communityProfile, interests:e.target.value})} />
              <select className='input' value={communityProfile.visibility || 'PUBLIC'} onChange={(e)=>setCommunityProfile({...communityProfile, visibility:e.target.value})}>
                <option value='PUBLIC'>Public</option>
                <option value='FOLLOWERS'>Followers only</option>
              </select>
              <button className='btn btn-dark'>Save Profile</button>
            </form>
          </article>

          <article className='panel'>
            <h4>{t('Create Post','Créer une publication','创建帖子')}</h4>
            <form className='list' onSubmit={async(e)=>{e.preventDefault(); await api.createCommunityPost(communityPostForm); setCommunityPostForm({ text:'', media_url:'', media_type:'TEXT', tags:'' }); await loadCommunity(); }}>
              <textarea className='input' rows={4} placeholder='Share your farm update, innovation, or product...' value={communityPostForm.text} onChange={(e)=>setCommunityPostForm({...communityPostForm, text:e.target.value})} />
              <input className='input' type='file' accept='image/*,video/*' onChange={(e)=>{
                const f = e.target.files?.[0]
                if (!f) return
                const inferredType = f.type.startsWith('video/') ? 'VIDEO' : 'IMAGE'
                const reader = new FileReader()
                reader.onload = () => setCommunityPostForm(prev => ({ ...prev, media_url: String(reader.result || ''), media_type: inferredType }))
                reader.readAsDataURL(f)
              }} />
              <select className='input' value={communityPostForm.media_type} onChange={(e)=>setCommunityPostForm({...communityPostForm, media_type:e.target.value})}>
                <option value='TEXT'>Text</option>
                <option value='IMAGE'>Image</option>
                <option value='VIDEO'>Video</option>
              </select>
              <input className='input' placeholder='Tags (e.g. goats, irrigation, organic)' value={communityPostForm.tags} onChange={(e)=>setCommunityPostForm({...communityPostForm, tags:e.target.value})} />
              <button className='btn btn-dark'>Post to Community</button>
            </form>
          </article>
        </div>

        <article className='panel' style={{marginTop:10}}>
          <div className='tabs' style={{marginBottom:8, flexWrap:'wrap'}}>
            <button className={`tab ${communityFeedMode === 'for-you' ? 'active' : ''}`} onClick={()=>setCommunityFeedMode('for-you')}>For You</button>
            <button className={`tab ${communityFeedMode === 'following' ? 'active' : ''}`} onClick={()=>setCommunityFeedMode('following')}>Following</button>
            <button className={`tab ${communityFeedMode === 'reels' ? 'active' : ''}`} onClick={()=>setCommunityFeedMode('reels')}>FarmReels</button>
          </div>
          <div className='list'>
            {(communityFeedMode === 'reels' ? communityPosts.filter(x => String(x.media_type || '').toUpperCase() === 'VIDEO') : communityPosts).map((p)=><div key={`cp-${p.id}`} className='panel' style={{padding:10,border:'1px solid #dbe6df',boxShadow:'0 1px 6px rgba(0,0,0,.05)'}}>
              <div className='list-row'>
                <strong>{p.author_name || `User ${p.user_id}`} {p.author_country ? `(${p.author_country})` : ''}</strong>
                <span style={{fontSize:'.78rem', color:'#64748b'}}>{String(p.created_at || '').replace('T',' ').slice(0,16)}</span>
              </div>
              {p.text && <div style={{margin:'6px 0', whiteSpace:'pre-wrap'}}>{p.text}</div>}
              {p.media_url && (
                p.media_type === 'VIDEO'
                  ? <video src={p.media_url} controls style={{width:'100%', maxHeight:360, borderRadius:10, background:'#000'}} />
                  : <img src={p.media_url} alt='community post' style={{width:'100%', maxHeight:360, objectFit:'cover', borderRadius:10}} />
              )}
              {!!p.tags && <div style={{fontSize:'.82rem', color:'#0284c7', marginTop:6}}>#{String(p.tags).split(',').map(s=>s.trim()).filter(Boolean).join(' #')}</div>}
              <div className='list-row' style={{marginTop:8}}>
                <button className='btn' onClick={async()=>{ await api.toggleCommunityPostLike(p.id); await loadCommunity(); }}>👍 Like ({p.likes_count || 0})</button>
                <button className='btn' onClick={async()=>{ const rows=await api.fetchCommunityPostComments(p.id).catch(()=>[]); setCommunityComments(prev=>({...prev,[p.id]:rows||[]})) }}>💬 Comments ({p.comments_count || 0})</button>
              </div>
              <div className='inlineForm' style={{marginTop:6}}>
                <input className='input' placeholder='Write comment...' value={communityCommentText[p.id] || ''} onChange={(e)=>setCommunityCommentText(prev=>({...prev,[p.id]:e.target.value}))} />
                <button className='btn' onClick={async()=>{ const txt=(communityCommentText[p.id]||'').trim(); if(!txt) return; await api.addCommunityPostComment(p.id,{text:txt}); setCommunityCommentText(prev=>({...prev,[p.id]:''})); const rows=await api.fetchCommunityPostComments(p.id).catch(()=>[]); setCommunityComments(prev=>({...prev,[p.id]:rows||[]})); await loadCommunity(); }}>Send</button>
              </div>
              {(communityComments[p.id] || []).length > 0 && <div className='list' style={{marginTop:6}}>
                {(communityComments[p.id] || []).slice(-5).map((c)=><div className='list-row' key={`cc-${c.id}`}><span><strong>{c.author_name || `User ${c.user_id}`}:</strong> {c.text}</span></div>)}
              </div>}
            </div>)}
            {!(communityFeedMode === 'reels' ? communityPosts.filter(x => String(x.media_type || '').toUpperCase() === 'VIDEO').length : communityPosts.length) && (
              <div className='two-col'>
                <div className='panel' style={{padding:8}}>
                  <div style={{width:'100%',height:150,borderRadius:8,background:'#f1f5f9',display:'grid',placeItems:'center',color:'#64748b'}}>No user image yet</div>
                  <div style={{marginTop:6,fontWeight:700}}>Community highlights loading…</div>
                  <div style={{fontSize:'.86rem',color:'#64748b'}}>Be the first to share your farm story.</div>
                </div>
                <div className='panel' style={{padding:8}}>
                  <div style={{width:'100%',height:150,borderRadius:8,background:'#f1f5f9',display:'grid',placeItems:'center',color:'#64748b'}}>No user image yet</div>
                  <div style={{marginTop:6,fontWeight:700}}>{communityFeedMode === 'reels' ? 'No FarmReels yet.' : 'No community posts yet.'}</div>
                  <div style={{fontSize:'.86rem',color:'#64748b'}}>Post updates, innovations, and products to light up this feed.</div>
                </div>
              </div>
            )}
          </div>
        </article>
      </section>}

      {active === 'ai-disease' && <section><h3>{t('AI Disease Analyzer','Analyseur IA des maladies','AI 病害分析')}</h3>
        <form className='inlineForm' onSubmit={async e => {
          e.preventDefault();
          try {
            if (!diseaseForm.target) { alert('Please select crop/animal type first.'); return }
            if (!diseaseForm.image_url) { alert('Please upload an image from your phone/camera.'); return }
            const r = await api.analyzeDisease({ user_id: Number(diseaseForm.user_id), crop_type: diseaseForm.target, image_url: diseaseForm.image_url, context_note: diseaseForm.context_note });
            alert(`Diagnosis: ${r.diagnosis}\nConfidence: ${Math.round((r.confidence||0)*100)}%\nRecommendation: ${r.recommendation || '-'}\nTreatment: ${r.treatment || '-'}\n${r.vet_notice || 'Important: Contact a licensed veterinarian/agronomist for confirmation before treatment.'}`);
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
          <textarea className='input' placeholder='Describe symptoms (optional): e.g., yellow spots, leaf curl, wilting, discharge, fever...' value={diseaseForm.context_note || ''} onChange={(e)=>setDiseaseForm({...diseaseForm,context_note:e.target.value})} rows={3} style={{minWidth:'100%'}} />
          <input className='input' type='file' accept='image/*' onChange={(e)=>{
            const f = e.target.files?.[0]
            if (!f) return
            setDiseaseImageFileName(f.name)
            const reader = new FileReader()
            reader.onload = () => {
              const data = String(reader.result || '')
              setDiseaseImagePreview(data)
              setDiseaseForm(prev => ({ ...prev, image_url: data }))
            }
            reader.readAsDataURL(f)
          }} />
          <button className='btn btn-dark'>Analyze</button>
        </form>
        {diseaseImageFileName && <p style={{fontSize:'.82rem',color:'#475569'}}>Uploaded: {diseaseImageFileName}</p>}
        {diseaseImagePreview && <img src={diseaseImagePreview} alt='Disease scan preview' style={{maxWidth:260,borderRadius:8,border:'1px solid #e2e8f0',marginBottom:8}} />}
        <DataTable columns={['id','user_id','crop_type','image_url','result','created_at']} rows={state.diseaseScans} filterKey='crop_type' />
      </section>}

      {active === 'plant-id' && <section>
        <h3>{t('🌿 AI Plant Identifier (Feed & Nutrition)','🌿 Identificateur IA des plantes (alimentation et nutrition)','🌿 AI 植物识别（饲料与营养）')}</h3>
        <form className='panel list' onSubmit={async e => {
          e.preventDefault()
          try {
            if (!plantIdForm.image_url) { alert('Please upload a plant image first.'); return }
            const r = await api.identifyPlant({
              user_id: Number(plantIdForm.user_id || 1),
              image_url: plantIdForm.image_url,
              file_name: plantIdForm.file_name,
              context_hint: plantIdForm.context_hint,
              target_livestock: plantIdForm.target_livestock
            })
            setPlantIdResult(r)
          } catch (err) {
            alert(`Plant identification failed: ${errMsg(err)}`)
          }
        }}>
          <div className='inlineForm'>
            <input className='input' placeholder='User ID' value={plantIdForm.user_id} onChange={(e)=>setPlantIdForm({...plantIdForm,user_id:e.target.value})} />
            <select className='input' value={plantIdForm.target_livestock} onChange={(e)=>setPlantIdForm({...plantIdForm,target_livestock:e.target.value})}>
              <option value='goats'>Goats</option>
              <option value='sheep'>Sheep</option>
              <option value='cattle'>Cattle</option>
              <option value='rabbits'>Rabbits</option>
              <option value='poultry'>Poultry</option>
            </select>
          </div>

          <input className='input' type='file' accept='image/*' onChange={(e)=>{
            const f = e.target.files?.[0]
            if (!f) return
            const reader = new FileReader()
            reader.onload = () => {
              const data = String(reader.result || '')
              setPlantIdPreview(data)
              setPlantIdForm(prev => ({ ...prev, image_url: data, file_name: f.name }))
            }
            reader.readAsDataURL(f)
          }} />
          <input className='input' placeholder='Context hint (optional): local name, where found, leaf smell, etc.' value={plantIdForm.context_hint} onChange={(e)=>setPlantIdForm({...plantIdForm,context_hint:e.target.value})} />
          {plantIdPreview && <img src={plantIdPreview} alt='Plant preview' style={{maxWidth:320,borderRadius:8,border:'1px solid #e2e8f0'}} />}
          <button className='btn btn-dark'>Identify Plant Now</button>
        </form>

        {plantIdResult && <article className='panel' style={{marginTop:10}}>
          <h4 style={{marginTop:0}}>{plantIdResult.identified_name}</h4>
          <div className='list'>
            <div className='list-row'><span>Confidence</span><strong>{Math.round(Number(plantIdResult.confidence || 0) * 100)}%</strong></div>
            <div className='list-row'><span>Feed suitability</span><strong>{plantIdResult.feed_suitability || '-'}</strong></div>
            <div className='list-row'><span>Best for</span><strong>{(plantIdResult.feed_for || []).join(', ') || '-'}</strong></div>
            <div className='list-row'><span>Nutrition</span><strong>{plantIdResult.nutrition ? JSON.stringify(plantIdResult.nutrition) : '-'}</strong></div>
          </div>
          <div className='list' style={{marginTop:8}}>
            {(plantIdResult.recommendations || []).map((x,i)=><div className='list-row' key={`pr-${i}`}><span>{x}</span></div>)}
          </div>
          <p style={{fontSize:'.8rem', color:'#64748b', marginTop:8}}>Engine: {plantIdResult.engine}</p>
        </article>}
      </section>}

      {active === 'pest-id' && <section>
        <h3>{t('🐛 AI Insect & Pest Identifier (Crop-Specific)','🐛 Identificateur IA insectes et ravageurs (spécifique culture)','🐛 AI 昆虫与害虫识别（作物专用）')}</h3>
        <form className='panel list' onSubmit={async e => {
          e.preventDefault()
          try {
            if (!pestIdForm.image_url) { alert('Please upload a pest image first.'); return }
            const r = await api.identifyPest({
              user_id: Number(pestIdForm.user_id || 1),
              crop_type: pestIdForm.crop_type,
              image_url: pestIdForm.image_url,
              file_name: pestIdForm.file_name,
              context_hint: pestIdForm.context_hint
            })
            setPestIdResult(r)
          } catch (err) {
            alert(`Pest identification failed: ${errMsg(err)}`)
          }
        }}>
          <div className='inlineForm'>
            <input className='input' placeholder='User ID' value={pestIdForm.user_id} onChange={(e)=>setPestIdForm({...pestIdForm,user_id:e.target.value})} />
            <select className='input' value={pestIdForm.crop_type} onChange={(e)=>setPestIdForm({...pestIdForm,crop_type:e.target.value})}>
              {cropOptions.map(c => <option key={`pc-${c}`} value={String(c).toLowerCase()}>{c}</option>)}
            </select>
          </div>
          <input className='input' type='file' accept='image/*' onChange={(e)=>{
            const f = e.target.files?.[0]
            if (!f) return
            const reader = new FileReader()
            reader.onload = () => {
              const data = String(reader.result || '')
              setPestIdPreview(data)
              setPestIdForm(prev => ({ ...prev, image_url: data, file_name: f.name }))
            }
            reader.readAsDataURL(f)
          }} />
          <input className='input' placeholder='Context hint (optional): where found, damage pattern, time of day, etc.' value={pestIdForm.context_hint} onChange={(e)=>setPestIdForm({...pestIdForm,context_hint:e.target.value})} />
          {pestIdPreview && <img src={pestIdPreview} alt='Pest preview' style={{maxWidth:320,borderRadius:8,border:'1px solid #e2e8f0'}} />}
          <button className='btn btn-dark'>Identify Pest Now</button>
          <p style={{fontSize:'.8rem', color:'#64748b'}}>Advice is informational and crop-specific best-effort. Always verify dose, pre-harvest interval, and local approved products with extension officer/agronomist.</p>
        </form>

        {pestIdResult && <article className='panel' style={{marginTop:10}}>
          <h4 style={{marginTop:0}}>{pestIdResult.identified_pest}</h4>
          <div className='list'>
            <div className='list-row'><span>Crop</span><strong>{pestIdResult.crop_type || '-'}</strong></div>
            <div className='list-row'><span>Confidence</span><strong>{Math.round(Number(pestIdResult.confidence || 0) * 100)}%</strong></div>
          </div>
          <div style={{marginTop:8,fontWeight:700}}>Characteristics</div>
          <div className='list'>{(pestIdResult.characteristics || []).map((x,i)=><div className='list-row' key={`pcar-${i}`}><span>{x}</span></div>)}</div>
          <div style={{marginTop:8,fontWeight:700}}>Prevention</div>
          <div className='list'>{(pestIdResult.prevention || []).map((x,i)=><div className='list-row' key={`pprev-${i}`}><span>{x}</span></div>)}</div>
          <div style={{marginTop:8,fontWeight:700}}>Treatment (crop + pest specific)</div>
          <div className='list'>{(pestIdResult.treatment || []).map((x,i)=><div className='list-row' key={`ptreat-${i}`}><span>{x}</span></div>)}</div>
          <p style={{fontSize:'.8rem', color:'#64748b', marginTop:8}}>Engine: {pestIdResult.engine}</p>
        </article>}
      </section>}

      {active === 'government' && <section><h3>{t('Government Programs','Programmes gouvernementaux','政府项目')}</h3>
        <article className='panel' style={{marginBottom:10}}>
          <div style={{fontWeight:700, marginBottom:6}}>What this section does</div>
          <div style={{fontSize:'.9rem', color:'#475569'}}>This page helps farmers discover official agriculture programs, grants, and ministry updates by country. Use the source links to apply directly on official government portals.</div>
        </article>

        <article className='panel'>
          <h4>{t('Official Programs & Subsidies (auto-check)','Programmes officiels & subventions (auto-vérification)','官方项目与补贴（自动检查）')}</h4>
          <div className='list'>
            {(state.govPrograms || []).map((g, i) => (
              <div className='list-row' key={`gov-int-${i}`}>
                <span><strong>{g.country}</strong> • {g.agency} — {safeGovHeadline(g)}</span>
                <a className='btn' href={g.source_url} target='_blank' rel='noreferrer'>Open Source</a>
              </div>
            ))}
            {!(state.govPrograms || []).length && <div className='list-row'><span>No official programs loaded yet.</span></div>}
          </div>
          <p style={{fontSize:'.82rem', color:'#64748b'}}>Information is best-effort. Always verify eligibility, deadlines, and requirements on official websites before applying.</p>
        </article>

        {((me?.role || '').toLowerCase() === 'admin') && <article className='panel' style={{marginTop:10}}>
          <div className='list-row'>
            <h4 style={{margin:0}}>Admin Tools</h4>
            <button type='button' className='btn' onClick={()=>setShowGovAdminTools(v=>!v)}>{showGovAdminTools ? 'Hide' : 'Show'}</button>
          </div>
          <p style={{fontSize:'.82rem', color:'#64748b', marginTop:6}}>These controls are for official operators only.</p>
          {showGovAdminTools && <div className='two-col' style={{marginTop:8}}>
            <article className='panel'>
              <h4>Record Subsidy Distribution</h4>
              <form className='list' onSubmit={async e => { e.preventDefault(); await api.govDistributeSubsidy({ ...govSubsidyForm, farmer_user_id: Number(govSubsidyForm.farmer_user_id), amount: Number(govSubsidyForm.amount) }); alert('Subsidy recorded successfully'); await load(); }}>
                <select className='input' value={govSubsidyForm.country} onChange={(e)=>setGovSubsidyForm({...govSubsidyForm,country:e.target.value})}><option value='GH'>Ghana</option><option value='NG'>Nigeria</option><option value='BF'>Burkina Faso</option></select>
                <input className='input' placeholder='Agency' value={govSubsidyForm.agency} onChange={(e)=>setGovSubsidyForm({...govSubsidyForm,agency:e.target.value})} />
                <input className='input' placeholder='Farmer User ID' value={govSubsidyForm.farmer_user_id} onChange={(e)=>setGovSubsidyForm({...govSubsidyForm,farmer_user_id:e.target.value})} />
                <input className='input' placeholder='Amount' value={govSubsidyForm.amount} onChange={(e)=>setGovSubsidyForm({...govSubsidyForm,amount:e.target.value})} />
                <button className='btn btn-dark'>Record Subsidy</button>
              </form>
            </article>

            <article className='panel'>
              <h4>Send Government Notice</h4>
              <form className='list' onSubmit={async e => { e.preventDefault(); await api.govCommunicate(govMsgForm); alert('Government message queued'); }}>
                <select className='input' value={govMsgForm.country} onChange={(e)=>setGovMsgForm({...govMsgForm,country:e.target.value})}><option value='GH'>Ghana</option><option value='NG'>Nigeria</option><option value='BF'>Burkina Faso</option></select>
                <input className='input' placeholder='Target (farmers/coops/all)' value={govMsgForm.target} onChange={(e)=>setGovMsgForm({...govMsgForm,target:e.target.value})} />
                <input className='input' placeholder='Message text' value={govMsgForm.text} onChange={(e)=>setGovMsgForm({...govMsgForm,text:e.target.value})} />
                <button className='btn btn-dark'>Send Notice</button>
              </form>
            </article>
          </div>}
        </article>}
      </section>}

      {active === 'contracts' && <section><h3>{t('Cross-Border Contracts (MVP)','Contrats transfrontaliers (MVP)','跨境合同（MVP）')}</h3><form className='inlineForm' onSubmit={async e => { e.preventDefault(); await api.createContract({ ...contractForm, quantity: Number(contractForm.quantity), price: Number(contractForm.price), delivery_date: new Date(contractForm.delivery_date).toISOString() }); await load() }}>
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
        <h2>{t('Admin Dashboard (Admin Only)','Tableau de bord admin (admin uniquement)','管理员仪表盘（仅管理员）')}</h2>
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
  </>
}
