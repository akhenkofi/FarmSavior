import React, { useEffect, useMemo, useRef, useState } from 'react'
// homepage-priority-refresh
import * as api from './services/api'

class AppErrorBoundary extends React.Component {
 constructor(props) {
 super(props)
 this.state = { hasError: false, message: '' }
 }

 static getDerivedStateFromError(error) {
 return { hasError: true, message: error?.message || 'The app hit an unexpected problem.' }
 }

 componentDidCatch(error, info) {
 console.error('FarmSavior UI crash', error, info)
 }

 render() {
 if (this.state.hasError) {
 return <div className='crash-shell'>
 <div className='crash-card'>
 <h2>FarmSavior hit a problem</h2>
 <p>The app recovered into safe mode instead of showing a blank screen.</p>
 <div className='helper-text' style={{marginBottom:12}}>Error: {this.state.message}</div>
 <div className='card-actions'>
 <button className='btn btn-dark' type='button' onClick={() => window.location.reload()}>Reload app</button>
 <button className='btn' type='button' onClick={() => { try { localStorage.removeItem('farmsavior_token') } catch {} window.location.href='/?public=1' }}>Open public view</button>
 </div>
 </div>
 </div>
 }
 return this.props.children
 }
}

const errMsg = (e) => e?.response?.data?.detail || e?.message || 'Request failed'
const verificationStatusLabel = (status) => ({ APPROVED: 'Verified', PENDING: 'Pending verification', DENIED: 'Verification denied', NOT_SUBMITTED: 'Not submitted' }[String(status || '').toUpperCase()] || String(status || 'Not submitted'))
const verificationBadge = (me) => me?.identity_blue_check ? ' 🔵' : ''
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

const compressImageFileToDataUrl = (file, { maxDim = 1600, quality = 0.82, maxChars = 900000 } = {}) => new Promise((resolve, reject) => {
 const reader = new FileReader()
 reader.onerror = () => reject(new Error('Could not read image file'))
 reader.onload = () => {
 const img = new Image()
 img.onerror = () => reject(new Error('Could not load selected image'))
 img.onload = () => {
 let scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1))
 const canvas = document.createElement('canvas')
 const ctx = canvas.getContext('2d')
 if (!ctx) return reject(new Error('Could not prepare image for upload'))

 let attempts = 0
 let output = ''
 let currentQuality = quality
 while (attempts < 6) {
 const width = Math.max(1, Math.round((img.width || 1) * scale))
 const height = Math.max(1, Math.round((img.height || 1) * scale))
 canvas.width = width
 canvas.height = height
 ctx.clearRect(0, 0, width, height)
 ctx.drawImage(img, 0, 0, width, height)
 output = canvas.toDataURL('image/jpeg', currentQuality)
 if (output.length <= maxChars) break
 currentQuality = Math.max(0.45, currentQuality - 0.12)
 scale *= 0.82
 attempts += 1
 }
 resolve(output)
 }
 img.src = String(reader.result || '')
 }
 reader.readAsDataURL(file)
})

const openLivestockManagement = () => {
 try {
 const url = new URL(window.location.href)
 url.searchParams.set('public', '0')
 url.searchParams.set('go', 'livestock-records')
 window.location.href = url.toString()
 return
 } catch {}

 const btns = Array.from(document.querySelectorAll('button, a, [role="tab"]'))
 const target = btns.find(el => {
 const t = String(el.textContent || '').toLowerCase().trim()
 return t.includes('livestock records management') || t === 'records' || t.includes('牲畜档案管理')
 })
 if (target && typeof target.click === 'function') target.click()
}

const PAYMENT_RETURN_CACHE_KEY = 'farmsavior_pending_checkout'
const paymentSectionLabel = (product) => ({
 'livestock-records': 'Livestock Records Premium',
 'poultry': 'Poultry University',
 'sheep': 'Sheep University',
 'goat': 'Goat University',
 'cattle': 'Cattle University',
}[product] || 'Subscription')
const paymentSectionRoute = (product) => ({
 'livestock-records': 'livestock-records',
 'poultry': 'poultry-university',
 'sheep': 'sheep-university',
 'goat': 'goat-university',
 'cattle': 'cattle-university',
}[product] || 'onboarding')
const formatDateTime = (value) => {
 if (!value) return '—'
 try {
 return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
 } catch {
 return String(value).replace('T', ' ').slice(0, 16)
 }
}
const formatMoney = (amount, currency='USD') => {
 const n = Number(amount || 0)
 try {
 return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 2 }).format(n)
 } catch {
 return `${currency || 'USD'} ${n.toFixed(2)}`
 }
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
const animalOptions = [
 { label: 'Poultry', value: 'poultry' },
 { label: 'Goats', value: 'goats' },
 { label: 'Sheep', value: 'sheep' },
 { label: 'Cattle', value: 'cattle' },
]

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
 { plan_code: 'free', name: 'Livestock Free', monthly_usd: 0, yearly_usd: 0, yearly_savings_pct: 0, record_limit: 25, features: ['Up to 25 animals total', 'No photos allowed', 'No documents allowed'] },
 { plan_code: 'premium', name: 'Livestock Premium', monthly_usd: 9.99, yearly_usd: 102.90, yearly_savings_pct: 14.2, record_limit: null, features: ['Unlimited animals', 'All livestock features unlocked', 'Photos and documents allowed', 'Choose monthly or yearly billing'] }
]

const poultryTracks = {
 layers: {
 title: 'Layers (Egg Production)',
 objective: 'Build a uniform, low-mortality flock that reaches strong peak lay and steady weekly tray cashflow.',
 kpis: ['Brooding mortality < 3%', 'Uniformity at 16 weeks > 85%', 'Peak hen-day production target: 90%+'],
 breeds: [
 'Lohmann Brown (imported hybrid): high lay persistency; requires strict feeding/light program',
 'ISA Brown (imported hybrid): strong peak output; needs tight biosecurity',
 'Hy-Line Brown (imported hybrid): reliable commercial performance; sensitive to heat/humidity stress',
 'Improved local ecotypes: stronger field resilience; lower top-end egg volume'
 ],
 modules: [
 {
 name: 'Module 1: Farm Setup, Budget, and Biosecurity',
 summary: 'Set up the farm right before birds arrive.',
 details: [
 'Target house orientation east-west to reduce direct heat load.',
 'Separate clean zone (feed, chicks) and dirty zone (waste, dead birds).',
 'Essential equipment: brooder heat source, drinkers, feeders, thermometer, weighing scale.',
 'Simple budget split: housing 35%, birds 20%, feed 35%, health 10%.',
 'Before arrival: disinfect house, rest 7-14 days, and set footbath at entry.'
 ]
 },
 {
 name: 'Module 2: Buying Chicks and First 14 Days',
 summary: 'Start strong to avoid early losses.',
 details: [
 'Buy from trusted hatchery with vaccination record and hatch date proof.',
 'On arrival check: bright eyes, active movement, dry navels, uniform size.',
 'First 24h: warm brooder, clean water + glucose/electrolyte, starter feed available immediately.',
 'Daily checks: crop fill, temperature behavior (crowding = cold, panting = hot), and droppings.',
 'Remove weak or sick chicks quickly into isolation pen.'
 ]
 },
 {
 name: 'Module 3: Grower Management (Week 3-16)',
 summary: 'Build frame, immunity, and flock uniformity before lay.',
 details: [
 'Move feed phases correctly: starter -> grower -> developer.',
 'Weekly random body-weight sampling (at least 10% birds).',
 'Keep lighting controlled to prevent premature laying.',
 'Maintain dry litter; replace wet spots daily to reduce disease pressure.',
 'Deworm and vaccination schedule must be followed without skipping.'
 ]
 },
 {
 name: 'Module 4: Start of Lay and Egg Quality Control',
 summary: 'Maximize peak production and reduce tray losses.',
 details: [
 'Transition to layer feed gradually to avoid production shock.',
 'Provide adequate calcium (shell quality) and fresh clean water 24/7.',
 'Collect eggs multiple times daily to reduce cracks and dirty eggs.',
 'Track key numbers every day: eggs produced, mortality, feed intake, cracked eggs.',
 'If production drops suddenly, check feed, water, heat stress, disease signs immediately.'
 ]
 },
 {
 name: 'Module 5: Sales, Records, and Scale Plan',
 summary: 'Build consistent production and reliable profit.',
 details: [
 'Grade eggs by size and shell quality for better pricing.',
 'Use customer mix: wholesalers + retailers + institutions (schools/hotels).',
 'Keep weekly profit sheet: feed cost, medicine cost, labor, mortality, revenue.',
 'Reinvest cycle profits into better feed storage and backup water system.',
 'Scale only after 2-3 stable cycles with acceptable mortality and margin.'
 ]
 }
 ]
 },
 broilers: {
 title: 'Broilers (Meat Production)',
 objective: 'Run repeatable high-margin meat cycles with strong growth, low mortality, and predictable market weights.',
 kpis: ['Cycle mortality < 5%', 'FCR target band: 1.5 - 1.9', 'Harvest uniformity > 80%'],
 breeds: [
 'Cobb 500: rapid growth and strong carcass output; sensitive to heat and poor ventilation',
 'Ross 308: competitive FCR; requires disciplined brooding and litter management',
 'Arbor Acres/Hubbard: market-proven lines; strong management dependence',
 'Local dual-purpose lines: better resilience; slower growth and less uniform carcass sizes'
 ],
 modules: [
 {
 name: 'Module 1: Cycle Planning and Buyer Mapping',
 summary: 'Plan sales before chick placement.',
 details: [
 'Set target market weight with buyers in advance (live market vs processing).',
 'Book chicks and feed supply before cycle start.',
 'Prepare downtime calendar for full cleaning between cycles.',
 'Set mortality and FCR targets for team accountability.'
 ]
 },
 {
 name: 'Module 2: Brooding Precision (Day 1-14)',
 summary: 'Early growth determines final profit.',
 details: [
 'Pre-heat house before chicks arrive.',
 'Check crop fill 4h, 8h, 24h after placement.',
 'Ensure uniform chick spread; adjust heat and airflow by behavior.',
 'Give only clean water and quality starter feed during first phase.'
 ]
 },
 {
 name: 'Module 3: Grow-Out Performance Control',
 summary: 'Control feed conversion and body weight.',
 details: [
 'Keep litter dry and ammonia low; poor litter kills margin fast.',
 'Measure sample weights twice weekly and compare with target chart.',
 'Adjust feed phase timing by actual growth, not guesswork.',
 'Reduce heat stress using airflow, shade, and cool-water timing.'
 ]
 },
 {
 name: 'Module 4: Disease Prevention and Emergency SOP',
 summary: 'Catch problems early and contain quickly.',
 details: [
 'Daily mortality log with reason notes.',
 'No cross-house movement without disinfection.',
 'At first unusual spike: isolate, call vet, collect sample, suspend bird movement.',
 'Respect withdrawal periods before sale.'
 ]
 },
 {
 name: 'Module 5: Harvest, Settlement, and Next-Cycle Upgrade',
 summary: 'Close each cycle with numbers and improvements.',
 details: [
 'Harvest in cooler hours to reduce transport stress.',
 'Sort birds by weight to match buyer classes.',
 'Close-cycle report: mortality, FCR, average weight, net margin per bird.',
 'Apply one improvement every cycle (ventilation, brooding, waterline, feed bin control).'
 ]
 }
 ]
 },
 guinea: {
 title: 'Guinea Fowl (Resilient + Premium Niche)',
 objective: 'Develop hardy guinea systems for meat/breeder markets with strong survival and premium seasonal pricing.',
 kpis: ['Keet survival to 8 weeks > 90%', 'Predation loss near zero', 'Consistent market-age batch quality'],
 breeds: [
 'Pearl guinea: dominant local market type; hardy and familiar to buyers',
 'Lavender/White strains: niche premium potential; variable source consistency',
 'Improved local breeder lines: climate-adapted; requires disciplined records for selection'
 ],
 modules: [
 {
 name: 'Module 1: Business Model and Sourcing',
 summary: 'Choose meat, breeder, or mixed strategy and source quality keets.',
 details: [
 'Map seasonal demand peaks and festival sales windows.',
 'Select reliable breeder source with hatch records.',
 'Start with manageable flock size to learn behavior and handling.'
 ]
 },
 {
 name: 'Module 2: Keet Brooding and Survival',
 summary: 'First weeks are the highest-risk period.',
 details: [
 'Stable brooder heat and draft control are critical.',
 'Use shallow drinkers to reduce drowning risk.',
 'Early protein-quality feed improves growth and immunity.',
 'Strict anti-predator netting from day one.'
 ]
 },
 {
 name: 'Module 3: Grow-Out and Behavior Management',
 summary: 'Control stress, movement, and losses.',
 details: [
 'Train birds to return to house with fixed feeding times.',
 'Provide shade and water points in hot dry zones.',
 'Split aggressive or overcrowded groups early.'
 ]
 },
 {
 name: 'Module 4: Health and Biosecurity',
 summary: 'Use preventive medicine and strict hygiene.',
 details: [
 'Adapt poultry vaccination principles with local veterinary guidance.',
 'Monitor parasite pressure and deworm by schedule + symptoms.',
 'Keep perimeter clean to reduce vectors and wild-bird contact.'
 ]
 },
 {
 name: 'Module 5: Sales and Scaling',
 summary: 'Capture premium value and expand safely.',
 details: [
 'Grade birds by weight and body condition before sale.',
 'Build repeat buyers in restaurants, events, and festive markets.',
 'Scale using small controlled expansions with record-based decisions.'
 ]
 }
 ]
 }
}

const poultryClimate = {
 humid: ['Ventilation and litter-dryness priority', 'Mycotoxin-safe feed storage', 'Vector + drainage control'],
 dry: ['Heat-stress mitigation + cool-water timing', 'Dust and respiratory risk control', 'Water reliability + electrolyte planning']
}

const poultryVaxProgram = [
 'Pre-placement: full wash/disinfection, downtime, rodent and vector control',
 'Day 0-1: confirm hatchery vaccination declaration, hatch date, and lot records',
 'Day 5-7: Newcastle prime only if this is not already covered by the hatchery program and your local protocol says to start then',
 'Day 10-14: IBD/Gumboro first dose in high-pressure zones or according to hatchery and veterinary guidance',
 'Day 18-24: ND/IBD booster per veterinary directive, product label, and water-application discipline',
 'Week 6-8 or pullet phase: fowl pox / region-specific vaccines where indicated for your district and production system',
 'Ongoing: coccidiosis prevention, sanitation review, and parasite control by housing type and local risk profile'
]

const poultryHealthGuides = {
 layers: {
  title: 'Layer vaccination + prevention calendar',
  caution: 'Educational planning tool only: exact layer vaccine products, route, dilution, revaccination interval, withdrawal periods, and legal use must be confirmed with a licensed local veterinarian or extension officer before application.',
  timing: [
   'Pre-placement to week 2: prepare the house early, verify hatchery vaccinations, start chicks warm and drinking fast, and protect brooding comfort because early stress delays later lay performance.',
   'Week 3-8: focus on frame build, litter dryness, coccidiosis control, and on-time booster execution; missed grower health discipline usually reappears as uneven pullets at point of lay.',
   'Week 9-16: keep pullets uniform, avoid premature light stimulation, and complete any point-of-lay health work early enough that birds are not stressed right as laying begins.',
   'Point of lay through peak production: protect water reliability, shell quality, heat control, and booster timing for long-cycle birds according to the local veterinary plan.'
  ],
  vaccines: [
   'Common commercial timing guide to validate locally: hatchery day-old vaccination may include Marek’s and sometimes Newcastle/IB support depending on source; never assume coverage without the hatchery declaration.',
   'Newcastle disease (ND): prime and booster timing varies by local pressure, product type, and hatchery program, but layers usually need a longer-term ND plan than broilers because they stay on farm for many months.',
   'IBD/Gumboro: confirm whether your zone, maternal antibody profile, and hatchery status require an early one-dose or two-dose program; poor timing creates expensive immunity gaps.',
   'Fowl pox / infectious bronchitis / egg-drop or other layer-relevant vaccines may be part of the pullet-to-lay plan where licensed products and local disease risk justify them; schedule these before peak lay stress, not during an unexplained production drop.'
  ],
  parasite: [
   'Internal parasite pressure is usually lower in well-managed cage systems than in deep-litter or free-range units, but do not assume zero risk where birds contact soil, insects, or mixed-age groups.',
   'Coccidiosis control is usually more important than routine worming in young layers; keep litter dry, stop leaks fast, and review anticoccidial strategy before reaching for random medication.',
   'For deep-litter or free-range layer flocks, discuss a strategic deworming calendar with your local vet around grower age, point of lay, and post-rain parasite pressure rather than monthly guesswork.',
   'Dose by real bird weight bands, respect egg withdrawal rules, and avoid off-label use without direct veterinary instruction.'
  ],
  seasonal: [
   'Humid / rainy periods: raise drinkers, remove wet litter daily, tighten rodent and wild-bird control, and inspect shell quality plus respiratory signs twice weekly.',
   'Dry / hot periods: protect cool clean water at midday, reduce heat build-up, and avoid making vaccine-water decisions during the hottest, most stressful hours.',
   'Holiday and school-demand windows: keep egg quality records tight because market opportunity means little if cracks, dirties, or shell weakness are rising.',
   'Before bringing in replacement pullets: empty, wash, disinfect, and rest the house long enough to break carryover infection pressure.'
  ],
  calendar: [
   'January-February: dry-season heat and water review, pullet uniformity checks, and targeted parasite review for deep-litter/free-range flocks.',
   'March-April: pre-rain drainage cleanup, rodent control reset, verify vaccine stock and cold chain before humidity pressure builds.',
   'May-August: highest litter moisture, coccidiosis, and respiratory pressure in many humid systems; intensify twice-weekly health walks and shell-quality review.',
   'September-October: point-of-lay or post-peak review window; check body weight, booster completion, egg quality drift, and deworm only where the housing system and local advice justify it.',
   'November-December: replace chronic non-performers, clean out houses before the next flock, and lock the next year’s pullet and vaccine plan onto one written calendar.'
  ]
 },
 broilers: {
  title: 'Broiler cycle vaccination + prevention calendar',
  caution: 'Educational planning tool only: broiler vaccine timing depends on hatchery history, local disease challenge, intended slaughter age, and withdrawal rules. Confirm all brands, routes, water-medication compatibility, and legal use with local veterinary authorities.',
  timing: [
   'Pre-placement to day 7: brooding precision matters more than almost anything else—weak heat, poor water access, or bad chick start can look like disease later even when the real cause was management.',
   'Day 8-21: keep broilers on schedule for ND/IBD work where used locally, while protecting litter dryness and watching for coccidiosis, wet droppings, and uneven growth.',
   'Day 22 to sale: the health focus shifts toward heat stress, respiratory pressure, leg quality, and avoiding medication or vaccine decisions that clash with slaughter withdrawal periods.',
   'Between cycles: complete total clean-out, wash, disinfect, dry, and downtime before the next placement so one weak batch does not infect the next one.'
  ],
  vaccines: [
   'Common field pattern to verify locally: day-old hatchery declarations may cover Marek\'s and sometimes ND/IB, but many broiler farms still run farm-level ND and/or IBD boosters depending on pressure and slaughter age.',
   'Newcastle disease (ND): timing often sits in the first and second/third week, but it must match hatchery status, outbreak pressure, and product label; do not copy another farm blindly.',
   'IBD/Gumboro: most useful where challenge is real and maternal antibody timing has been considered; a badly timed dose may give false confidence.',
   'Coccidiosis prevention usually relies more on feed program, litter management, and sanitation than on emergency treatment after the flock has already lost performance.'
  ],
  parasite: [
   'Routine worming is less common in short-cycle housed broilers than in long-cycle or free-range birds; focus first on litter, drinker leaks, insect pressure, and coccidiosis control.',
   'Where broilers are kept longer, partially ranged, or on reused ground, review internal parasite risk after the rains and around cycle carryover points with a veterinarian.',
   'Do not medicate late in the cycle without checking withdrawal periods against the actual planned sale date.',
   'Keep flies, beetles, rodents, and wild birds under control because they act like disease and parasite pressure multipliers even when worms are not the main issue.'
  ],
  seasonal: [
   'Humid / rainy periods: wet litter, ammonia, coccidiosis, and respiratory flare-ups rise fast; patrol drinker lines and low-airflow corners every day.',
   'Dry / hot periods: protect airflow, shade, stocking comfort, and cool water timing because midday heat quietly ruins gain and FCR before obvious deaths begin.',
   'Festival or target-market windows: map sale date backward from withdrawal deadlines and target weight so birds are not held too long while still under medication restriction.',
   'Downtime season discipline: if consecutive cycles run through the rains, increase clean-out and insect-control intensity rather than just adding more medicine.'
  ],
  calendar: [
   'January-February: dry-season ventilation and heat-stress review, line flushing, and cycle-close margin checks before the next placement.',
   'March-April: pre-rain drainage work, litter-material stocking, and vaccine cold-chain preparation for higher disease pressure months.',
   'May-August: highest wet-litter and coccidiosis risk in many regions; inspect droppings, body-weight spread, and mortality pattern daily.',
   'September-October: post-rain clean-out discipline, insect control, and review whether the last cycles lost money through delayed sale or poor FCR.',
   'November-December: plan festive-market batches early, align withdrawal calendars with buyer dates, and do not sacrifice downtime just to squeeze in one more placement.'
  ]
 },
 guinea: {
  title: 'Guinea fowl prevention + hardy-season calendar',
  caution: 'Educational planning tool only: guinea fowl vaccine availability, age suitability, and parasite-control labels vary sharply by country. Use poultry products only where the label or a licensed veterinarian specifically supports that use.',
  timing: [
   'Pre-placement to 4 weeks: keet warmth, dryness, and predator protection are the first health program; a chilled or panicked keet flock will never show its true potential.',
   'Week 5-10: transition carefully from brooder dependence into grow-out or controlled ranging while keeping shelter return habits strong and monitoring for weather-related setbacks.',
   'Grow-out to breeder/market age: focus on survival, parasite pressure under ranging systems, and keeping birds strong through wet nights and hot afternoons.',
   'Breeder or long-kept flocks: review periodic booster need, external parasite pressure, and fence/perimeter biosecurity before the next seasonal stress window.'
  ],
  vaccines: [
   'Many guinea operations adapt core poultry vaccination principles—especially ND and fowl pox where locally relevant—but exact suitability, age timing, and label support must be confirmed before use.',
   'Ask local veterinary authorities whether your district commonly vaccinates guinea fowl against Newcastle disease and what schedule is actually followed under field conditions.',
   'If breeder guinea are kept for extended periods, discuss whether any longer-cycle booster plan is warranted rather than copying a short broiler schedule.',
   'Do not mix species assumptions: what works for chickens is not automatically label-approved or effective for guinea fowl.'
  ],
  parasite: [
   'Guinea on range can pick up worms, ticks, lice, and other external parasites more readily than confined broilers, so the control plan should match how much ground the birds cover.',
   'After the rains, inspect body condition, feather quality, droppings, and nighttime roost hygiene before deciding whether treatment is needed.',
   'Keep perimeter grass controlled, remove damp organic waste, and reduce standing water because vectors and wild-bird contact rise where the range is unmanaged.',
   'Use only products with clear species guidance or direct veterinary instruction, and separate weak birds early because shy guinea hide decline well.'
  ],
  seasonal: [
   'Humid / rainy periods: secure dry night housing, stop puddles near drinkers, and tighten predator control because wet stressed birds are easier losses.',
   'Dry / hot periods: protect shade, walking distance to water, and low-stress afternoon handling so birds do not burn condition before market.',
   'Festive and premium-market windows: build sale groups from healthy uniform birds early; do not wait for the week of sale to separate culls and breeder-quality stock.',
   'Before widening range access: train return-to-house behavior first, or predator and weather losses will erase the premium.'
  ],
  calendar: [
   'January-February: dry-season shade, water, and predator review; inspect body condition in ranging birds and clean night shelters thoroughly.',
   'March-April: pre-rain roof repair, drainage cleanup, and confirm with local vets whether ND/fowl pox timing should be refreshed for the coming high-risk period.',
   'May-August: highest wet-season survival pressure for many free-range guinea systems; watch keets and growers closely for chill, parasite buildup, and failure to return strongly to shelter.',
   'September-October: post-rain parasite and predator-loss review, sort breeder candidates, and cull chronic weak birds before dry-season market pushes.',
   'November-December: festive-sales planning, perimeter tightening, and written breeder/market split for the next season.'
  ]
 }
}

const sheepTracks = {
 balamiCross: {
 title: 'Boboji (WAD) × Balami/Sudanese Cross',
 objective: 'Build larger, hardy commercial lines by blending local adaptation with improved frame and carcass traits.',
 breeds: [
 'Boboji (WAD): heat tolerance, hardiness, low-input survival',
 'Balami/Sudanese cross ram: size/frame growth uplift',
 'F1 outcome: improved growth while retaining adaptation',
 'Selection focus: fertility, mothering, feed efficiency'
 ],
 kpis: ['Conception rate > 85%', 'Lamb survival to weaning > 90%', 'Average daily gain target by 6 months'],
 modules: [
 { name:'Module 1: Breed Selection + Ghana Sheep Program', summary:'Understand all 3 phases and choose correct foundation pairings.', details:['Phase 1 foundation cross logic and risk control.','Choose healthy Boboji ewes with strong maternal records.','Use only proven Balami/Sudanese cross rams with performance notes.','Define panel-specific KPI targets before mating.']},
 { name:'Module 2: Foundation Flock Setup + Ram Selection', summary:'Set mating groups, ratios, and pre-breeding prep.', details:['Ram:ewe ratio planning and mating calendar.','Body condition scoring and flushing protocol.','Biosecurity before breeding season.','Record pedigree start points to avoid inbreeding drift.']},
 { name:'Module 3: Breeding Management + Pregnancy Care', summary:'Run controlled mating and gestation routines.', details:['Heat detection and controlled exposure windows.','Pregnancy nutrition by trimester.','Pre-lambing housing and stress reduction.','Cull criteria for poor fertility lines.']},
 { name:'Module 4: Lamb Survival, Growth + Flock Health', summary:'Protect lambs and accelerate uniform growth.', details:['Colostrum, neonatal checks, and early growth SOP.','Parasite control and vaccination timing discipline.','Weaning strategy by weight and health status.','Growth tracking and weak-line intervention.']},
 { name:'Module 5: Sales, Records + Scale Program', summary:'Convert performance into market outcomes.', details:['Grade animals by structure, growth, and health index.','Use data-backed retention vs sale decisions.','Maintain breeding ledger for line consistency.','Scale only after 2 stable generations.']}
 ]
 },
 udaCross: {
 title: 'Boboji (WAD) × Uda/Sudanese Cross',
 objective: 'Develop resilient high-performance meat lines with stronger frame and market weight consistency.',
 breeds: [
 'Boboji (WAD): climate resilience and disease tolerance',
 'Uda/Sudanese cross ram: growth, size, and carcass potential',
 'F1 outcome: stronger market size with retained hardiness',
 'Selection focus: growth, hoof quality, lambing ease'
 ],
 kpis: ['Lambing interval optimization', 'Weaning weights up vs baseline', 'Mortality reduction across seasons'],
 modules: []
 },
 ghanaElite: {
 title: 'Ghana Sheep Breed (Elite Finish)',
 objective: 'Consolidate hardiness + meat quality by crossing top hybrids with Ladoum/Dorper cross sires.',
 breeds: [
 'Top selected hybrid ewes from phase 1+2',
 'Ladoum/Dorper cross ram: terminal growth and meat traits',
 'Elite outcome: Ghana Sheep Breed candidate line',
 'Selection focus: uniformity, carcass, adaptability'
 ],
 kpis: ['Uniform market batch quality', 'Reproducible growth curves', 'Breed standard consistency'],
 modules: []
 }
}

// reuse core module structure across sheep panels
sheepTracks.udaCross.modules = sheepTracks.balamiCross.modules
sheepTracks.ghanaElite.modules = sheepTracks.balamiCross.modules

const sheepClimate = {
 humid: ['Parasite load control + rotational grazing discipline', 'Drainage and hoof-rot prevention', 'Mold-free feed storage and mineral balance'],
 dry: ['Heat-stress water strategy + shade design', 'Browse + concentrate balancing', 'Dust/respiratory management and electrolyte support']
}

const sheepHealthProgram = [
 'Pre-breeding: deworm + mineral correction + body condition alignment',
 'Breeding window: strict ram rotation and mating record capture',
 'Gestation: trimester nutrition plan + vaccination by local protocol',
 'Pre-lambing: pen disinfection + lambing kit readiness',
 'Post-lambing: colostrum assurance, naval care, early growth checks',
 'Ongoing: parasite surveillance, hoof care, respiratory monitoring'
]

const sheepPhaseLabels = ['Phase 1: Foundation Cross', 'Phase 2: Hybrid Development', 'Phase 3: Elite Finish']


const goatTracks = {
 sahelianCross: {
 title: 'WAD (Boboji) × Sahelian Cross',
 objective: 'Increase height/frame while preserving resilience and climate adaptation for commercial meat lines.',
 breeds: [
 'WAD (Boboji): hardiness, parasite tolerance, low-input survival',
 'Sahel buck lines (Sahel/Red Sokoto/Maradi): frame and growth uplift',
 'F1 outcome: taller, stronger market frame with retained adaptation',
 'Selection rule: never dilute WAD genetics below 25%'
 ],
 kpis: ['Conception rate > 85%', 'Kid survival to weaning > 88%', 'Average daily gain target by 6 months'],
 modules: [
 { name:'Module 1: Ghana Goat Breed Program + Breed Selection', summary:'Understand 3-phase crossing and pick correct foundation lines.', details:['Phase 1: WAD ewes × Sahelian-type bucks.','Phase 2: F1 consolidation for uniformity/adaptation.','Phase 3: elite terminal sires for size + carcass.','WAD minimum genetics warning: keep ≥25% for resilience.']},
 { name:'Module 2: Foundation Flock Setup + Buck Selection', summary:'Prepare mating groups and pick high-quality sires.', details:['Buck:ewe ratio and controlled breeding windows.','Pre-breeding mineral/body-condition correction.','Select Sahel/Red Sokoto/Maradi based on availability + records.','Start lineage records from day one.']},
 { name:'Module 3: Breeding Management + Pregnancy/Kidding Care', summary:'Run disciplined breeding and kidding management.', details:['Heat detection and mating logs by line.','Trimester feeding and kidding pen prep.','Twin-kid risk management and doe recovery SOP.','Cull low-fertility/poor-mothering lines.']},
 { name:'Module 4: Kid Survival, Growth + Health Control', summary:'Protect kids and drive stable growth.', details:['Colostrum assurance and neonatal check protocol.','Haemonchus risk monitoring and deworm strategy.','CCPP watch and fast respiratory response SOP.','Weaning by weight/health, not age alone.']},
 { name:'Module 5: Sales, Records + Scale Program', summary:'Convert genetic gains into stable profit.', details:['Grade by frame, growth, health, and carcass traits.','Retain top replacement does by KPI scores.','Build buyer classes by market weight targets.','Scale after consistent 2-cycle performance.']}
 ]
 },
 redSokotoMaradiCross: {
 title: 'WAD (Boboji) × Red Sokoto/Maradi',
 objective: 'Leverage twinning potential and growth while preserving local hardiness.',
 breeds: [
 'WAD (Boboji): resilience and disease tolerance',
 'Red Sokoto: meat market acceptance + frame',
 'Maradi: prolificacy and maternal productivity',
 'F1 outcome: improved size with higher twinning potential'
 ],
 kpis: ['Twin kid survival uplift', 'Uniform market weights', 'Lower mortality in humid/dry swings'],
 modules: []
 },
 ghanaElite: {
 title: 'Ghana Goat Breed (Boer/Kalahari Red/Savannah Elite Finish)',
 objective: 'Finish the line with elite terminal sires while retaining adaptation and resilience.',
 breeds: [
 'Top selected hybrids from phase 1+2',
 'Boer cross sires: strong meat frame',
 'Kalahari Red/Savannah crosses: savanna robustness + growth',
 'Elite outcome: Ghana Goat Breed candidate line'
 ],
 kpis: ['Uniformity of elite batches', 'Reproducible growth and carcass quality', 'Climate resilience retention'],
 modules: []
 }
}

goatTracks.redSokotoMaradiCross.modules = goatTracks.sahelianCross.modules
goatTracks.ghanaElite.modules = goatTracks.sahelianCross.modules

const goatClimate = {
 humid: ['Aggressive Haemonchus control + rotational browse strategy', 'Drainage + hoof/skin infection prevention', 'Mold-free feed and shelter ventilation'],
 dry: ['Heat mitigation + water reliability', 'Browse resource mapping + drought feed buffers', 'Dust/respiratory risk control (CCPP watch)']
}

const goatHealthProgram = [
 'Pre-breeding: deworm strategy + mineral balancing',
 'Breeding window: sire rotation and mating logs',
 'Pregnancy: trimester nutrition and stress control',
 'Kidding: hygiene, colostrum, and twin-kid support protocol',
 'CCPP surveillance and immediate respiratory response SOP',
 'Ongoing Haemonchus monitoring and targeted parasite control'
]

const goatPhaseLabels = ['Phase 1: WAD × Sahelian-type Foundation', 'Phase 2: Hybrid Consolidation', 'Phase 3: Elite Terminal Finish']


const cattleTracks = {
 wadSanga: {
 title: 'WAD/Sanga Cows × Sahelian/Zebu Cross Bulls',
 objective: 'Lift frame and growth while retaining local adaptation and mothering performance.',
 breeds: [
 'WAD/Sanga cow base: hardiness and local disease resilience',
 'Sahelian/Zebu cross bulls: frame and growth potential',
 'F1 outcome: bigger structure with retained climate adaptation',
 'Selection focus: fertility, calf survival, growth consistency'
 ],
 kpis: ['Conception rate > 80%', 'Calf survival to weaning > 90%', 'Weight gain target by 12 months'],
 modules: [
 { name:'Module 1: Ghana Cattle Breed Program + Breed Selection', summary:'Understand 3-phase crossing and select foundation herds.', details:['Phase 1: local adapted cows × Sahel/Zebu type bulls.','Phase 2: hybrid consolidation for uniformity.','Phase 3: elite terminal finish using Brahman or Gudali sires for carcass quality.','Preserve local adaptation traits while scaling size.']},
 { name:'Module 2: Foundation Herd Setup + Bull Selection', summary:'Organize breeding groups and choose performance sires.', details:['Bull:cow ratio and mating season design.','Body condition, mineral and water planning.','Bull health screening and libido checks.','Pedigree + growth log setup.']},
 { name:'Module 3: Breeding Management + Pregnancy/Calving Care', summary:'Run controlled breeding and safe calving workflows.', details:['Heat detection and service records.','Pregnancy nutrition by stage.','Pre-calving housing and emergency plan.','Postpartum recovery and rebreeding timing.']},
 { name:'Module 4: Calf Survival, Growth + Herd Health', summary:'Protect calves and accelerate healthy growth.', details:['Colostrum protocol and neonatal checks.','Tick/blood-parasite control schedule.','Respiratory + digestive disease monitoring.','Growth tracking and weak-line correction.']},
 { name:'Module 5: Sales, Records + Scale Program', summary:'Translate herd performance into repeatable business growth.', details:['Grade by frame, health, and weight class.','Retention strategy for replacement heifers.','Performance-led culling decisions.','Scale after multi-cycle KPI stability.']}
 ]
 },
 wadFulani: {
 title: 'WAD/Sanga Cows × White Fulani/Sudanese Cross Bulls',
 objective: 'Build larger dual-purpose lines with stronger market weights and adaptation.',
 breeds: [
 'WAD/Sanga cow base',
 'White Fulani/Sudanese cross bulls',
 'F1 outcome: growth and frame lift',
 'Selection focus: calf vigor + feed efficiency'
 ],
 kpis: ['Calving interval control', 'Calf mortality reduction', 'Uniform sale weights'],
 modules: []
 },
 ghanaElite: {
 title: 'Ghana Cattle Breed (Elite Finish)',
 objective: 'Consolidate hardy local genetics with premium carcass traits for West African commercial beef systems.',
 breeds: [
 'Top selected hybrid cows',
 'Elite terminal sires: Brahman or Gudali (by region availability)',
 'Outcome: Ghana Cattle Breed candidate line',
 'Selection focus: carcass quality + resilience'
 ],
 kpis: ['Batch uniformity', 'Carcass quality consistency', 'Resilience under humid/dry conditions'],
 modules: []
 }
}

cattleTracks.wadFulani.modules = cattleTracks.wadSanga.modules
cattleTracks.ghanaElite.modules = cattleTracks.wadSanga.modules

const cattleClimate = {
 humid: ['Tick and vector pressure control', 'Drainage and hoof/skin hygiene', 'Fodder conservation and mold prevention'],
 dry: ['Heat mitigation and water security', 'Dry-season feed budgeting', 'Dust/respiratory stress management']
}

const cattleHealthProgram = [
 'Pre-breeding health checks and deworming protocol',
 'Breeding season bull health and service tracking',
 'Pregnancy vaccination schedule per local veterinary guidance',
 'Calving prep, neonatal care, and colostrum assurance',
 'Tick-borne disease surveillance and rapid treatment SOP',
 'Ongoing herd health records and mortality audits'
]

const cattlePhaseLabels = ['Phase 1: Foundation Cross', 'Phase 2: Hybrid Consolidation', 'Phase 3: Elite Finish']



const livestockHealthGuides = {
 sheep: {
  title: 'Practical vaccination + deworming schedule',
  caution: 'Educational schedule only: confirm diseases covered, product choice, route, booster interval, withdrawal period, and legal use with your local veterinarian or extension officer before dosing.',
  timing: [
   'Start-of-wet-season (about 4-6 weeks before heavy rains): clean pens, improve drainage, review pasture rotation, and vaccinate breeder groups early enough for immunity before parasite and pneumonia pressure rises.',
   'Peak wet season: monitor lambs and late-pregnant ewes twice weekly for anemia, scours, coughing, foot problems, and falling body condition; deworm only animals or groups that trigger need, not the whole flock by habit.',
   'Late wet / early dry season: review lamb growth, fecal egg counts or FAMACHA-style anemia checks where used, and give boosters only where label or local disease risk indicates.',
   'Late dry season / pre-breeding: body-condition score ewes, correct minerals, review breeding records, vaccinate and deworm high-risk animals early so mating is not disrupted by avoidable health stress.'
  ],
  vaccines: [
   'Core breeder category: clostridial protection (commonly CDT or broader clostridial products where locally approved). Give the primary series to replacements, then annual booster 2-6 weeks before lambing so colostrum protects lambs.',
   'Region-specific category: PPR where this is part of the national small-ruminant program; follow government/veterinary campaign timing and revaccination interval used in your area.',
   'Risk-based category: pasteurellosis / pneumonia-related vaccines where rainy-season respiratory pressure is a known farm problem and a licensed product is available locally.',
   'Lamb timing guide: if dams were properly boosted pre-lambing, begin the lamb primary series at the age recommended on the label/local protocol, then give the booster on schedule before weaning or high-risk weather.'
  ],
  deworm: [
   'Target the right animals first: lambs after weaning, thin ewes, high-FAMACHA/anemia animals, and groups grazing low wet pasture usually need the closest monitoring.',
   'Use dewormer categories strategically, not brand-hopping every few weeks: benzimidazoles (white drenches), macrocyclic lactones, and imidazothiazole/tetrahydropyrimidine groups should be rotated by efficacy evidence or seasonal review, not every single treatment date.',
   'Wet season rule: shorten monitoring intervals because Haemonchus risk climbs fast; move sheep to taller, cleaner pasture and avoid repeatedly grazing the same wet, contaminated paddock.',
   'Dry season rule: do not keep drenching on a calendar when worm challenge is low; preserve refugia by leaving low-risk, thriving animals untreated when appropriate and advised locally.',
   'Dose by accurate weight or the heaviest animal in the group if one drench gun setting is used, and calibrate the drench gun before each treatment day.'
  ],
  calendar: [
   'January-February: dry-season review, body condition, mineral support, and targeted deworming only for high-risk groups.',
   'March-April: prepare for rains; breeder vaccination window, hoof trimming, drainage fixes, and pasture rotation plan.',
   'May-August: highest wet-season parasite and pneumonia pressure in many areas; monitor anemia, growth, scours, and treat selectively but fast.',
   'September-October: reassess booster needs, lamb growth, and post-rain worm burden; cull chronic poor performers.',
   'November-December: pre-breeding checks, replacement review, and annual records cleanup before the next mating cycle.'
  ]
 },
 goat: {
  title: 'Practical vaccination + deworming schedule',
  caution: 'Educational guidance only: verify local goat vaccine availability, label age limits, milk/meat withdrawal periods, and dose-by-weight requirements with a licensed veterinarian before treatment.',
  timing: [
   '4-6 weeks before the wet season or before kidding concentration periods: repair roofs and drainage, separate age groups, and vaccinate does early enough to protect kids through colostrum.',
   'Wet season / humid months: monitor goats at least weekly for Haemonchus anemia, bottle jaw, diarrhea, cough, and foot issues; do not wait for severe weight loss before acting.',
   'Late wet season: review whether your selective treatment approach actually worked by checking body condition, kid growth, deaths, and where possible fecal egg count reduction or other veterinary efficacy checks.',
   'Dry season / pre-breeding: restore body condition, support browse quality and minerals, and schedule any needed breeder boosters or targeted deworming before mating stress rises.'
  ],
  vaccines: [
   'Core breeder category: clostridial vaccines such as CDT or locally approved equivalents. Replacements need a full primary series; pregnant does are commonly boosted 2-6 weeks before kidding to improve kid protection.',
   'Region-specific category: PPR vaccination where the disease is present and the product is part of local control programs.',
   'Risk-based category: contagious caprine pleuropneumonia (CCPP) vaccine in areas where CCPP is endemic or specifically advised by local veterinary services.',
   'Kid timing guide: start the kid primary series according to label and local veterinary advice, especially if dam vaccination status is unknown or weak.'
  ],
  deworm: [
   'Goats often metabolize some dewormers differently from sheep, so never copy a sheep dose without checking the goat label or veterinary instruction.',
   'Build selective treatment around anemia scoring, body condition, kid growth, and known worm hotspots instead of whole-herd monthly drenching.',
   'Recommended dewormer categories to discuss with local vets: benzimidazoles, macrocyclic lactones, and levamisole-class products; rotate based on reduced efficacy or seasonal review, not because the calendar changed.',
   'Wet season rule: move goats onto browse or taller forage faster, keep sleeping areas dry, and avoid forcing kids to graze the shortest, most contaminated pasture.',
   'Resistance-control rule: leave some healthy low-risk animals untreated when appropriate, avoid underdosing, and check whether the product still works on your farm before repeating the same active ingredient.'
  ],
  calendar: [
   'January-February: dry-season browse planning, mineral support, selective deworming for thin or anemic groups, and buck readiness checks.',
   'March-April: pre-rain vaccination window for breeder groups, shelter repair, hoof care, and kidding-area sanitation.',
   'May-August: highest worm and respiratory risk in many humid systems; weekly anemia checks, rapid separation of cough cases, and targeted treatment.',
   'September-October: review kid survival, growth, and drench performance; booster only where risk/label requires.',
   'November-December: pre-breeding condition recovery, culling of chronic parasite losers, and written plan for the next kidding season.'
  ]
 },
 cattle: {
  title: 'Practical vaccination + parasite-control schedule',
  caution: 'Use this as a herd-planning guide only: final cattle vaccine program must match your country, production system, pregnancy status, and local disease map. Confirm product labels, withdrawal times, and dosing with a veterinarian.',
  timing: [
   '4-8 weeks before the rains or before breeding starts: repair water points, reduce mud around troughs, vaccinate breeding stock early enough for immunity before vector and calf-disease pressure climbs.',
   'Wet season: inspect calves and breeding females weekly for ticks, diarrhea, pneumonia, pinkeye, foot issues, and falling weight gains; young stock should not disappear into the herd unseen.',
   'Transition out of rains: review calf survival, tick burden, and whether strategic deworming or ectoparasite control actually improved growth and fertility.',
   'Late dry season: plan breeder vaccination, mineral supplementation, water security, and bull soundness before the next mating window.'
  ],
  vaccines: [
   'Core calf/breeder category depends on local program but often includes clostridial protection (for example blackleg-type products) with a primary course in young stock and scheduled boosters as labeled.',
   'Region-specific category: anthrax, lumpy skin disease, CBPP, or other nationally important vaccines where government/veterinary authorities recommend them.',
   'Breeding-herd category: vaccinate replacement heifers and cows before breeding or calving windows as advised locally so immunity is established before peak exposure.',
   'Calf timing guide: give first and booster doses according to product label/local protocol, then keep the calf schedule tied to weaning, branding, or seasonal handling dates so it actually gets done.'
  ],
  deworm: [
   'For grazing cattle, combine internal parasite control with tick and fly control instead of treating worms in isolation.',
   'Recommended internal dewormer categories to review with your vet: benzimidazoles, macrocyclic lactones, and levamisole-class products where approved; choose based on age group, season, and farm efficacy history.',
   'Wet season rule: calves, weaners, and heavily stocked groups usually need the closest monitoring because worm challenge and vector pressure rise together.',
   'Dry season rule: focus more on water quality, forage gaps, and body condition; strategic treatment may be enough where parasite challenge falls.',
   'Pour-ons, injectables, and drenches are not interchangeable by guesswork: select the route for the target parasite problem, weigh animals accurately, and record lot number plus treatment date.'
  ],
  calendar: [
   'January-February: dry-season water and feed stress review, strategic deworming where needed, and bull/cow body-condition checks.',
   'March-April: pre-rain herd vaccination window, vector-control prep, calving area cleanup, and mineral restocking.',
   'May-August: wet-season tick, worm, and calf-disease watch; inspect calves weekly and keep treatment records current.',
   'September-October: post-rain herd review, booster/risk-based vaccines as advised locally, and cull chronic poor mothers or weak growers.',
   'November-December: breeder readiness, pregnancy/calf survival review, and next-season herd-health budget planning.'
  ]
 }
}


Object.values(poultryTracks).forEach(track => {
 track.modules = (track.modules || []).map((m, idx) => ({
 ...m,
 details: [
 ...(m.details || []),
 `Set a weekly operating standard for ${track.title.toLowerCase()} before increasing flock size.`,
 'Track one production indicator, one health signal, one feed indicator, and one market indicator every week.',
 idx === 0 ? 'Convert the startup plan into a clear written operating procedure for managers and supervisors.' : 'Define one corrective action for each major KPI so underperformance is handled quickly and consistently.'
 ]
 }))
})

Object.values(sheepTracks).forEach(track => {
 track.modules = (track.modules || []).map((m, idx) => ({
 ...m,
 details: [
 ...(m.details || []),
 `State the breeding objective for ${track.title.toLowerCase()} clearly and use it to guide every retention decision.`,
 'Maintain a simple ranking sheet for fertility, survival, structure, growth, and mothering so replacement decisions are evidence-based.',
 idx === 3 ? 'Include a red-flag response plan for parasite pressure, lamb weakness, and post-lambing maternal failure.' : 'Document one avoidable loss source and one management improvement after every cycle review.'
 ]
 }))
})

Object.values(goatTracks).forEach(track => {
 track.modules = (track.modules || []).map((m, idx) => ({
 ...m,
 details: [
 ...(m.details || []),
 `Convert ${m.name.toLowerCase()} into a clear operating checklist for supervisors and farm managers.`,
 'Compare humid-zone and dry-zone risks before changing feed, breeding, or housing strategy.',
 idx === 4 ? 'Review margin per doe exposed, per kid weaned, and per batch sold before scaling.' : 'Define the early signs that this module is improving farm performance within 30 days.'
 ]
 }))
})

Object.values(cattleTracks).forEach(track => {
 track.modules = (track.modules || []).map((m, idx) => ({
 ...m,
 details: [
 ...(m.details || []),
 `Assign one financial KPI and one biological KPI to ${m.name.toLowerCase()} so performance is reviewed as a business system.`,
 'Record the seasonal constraint most likely to break performance—water, feed, heat, ticks, or labor—and define the contingency action now.',
 idx === 2 ? 'Require a calving-risk response plan covering labor readiness, calf support, and postpartum recovery.' : 'Review whether current gains come from better management, not genetics alone.'
 ]
 }))
})


const normalizeCurriculumText = (value = '') => {
 const text = String(value || '').replace(/\s+/g, ' ').trim()
 if (!text) return ''
 return text.charAt(0).toUpperCase() + text.slice(1)
}

const normalizeModuleHeading = (value = '') => String(value || '').replace(/^Module\s+(\d+)\s*:/i, 'Pillar $1:')

const appendManualDetails = (tracks, extraByIndex) => {
 Object.values(tracks).forEach(track => {
 track.modules = (track.modules || []).map((m, idx) => ({
 ...m,
 details: [...(m.details || []), ...((extraByIndex[idx] || []).map(x => normalizeCurriculumText(x.replaceAll('{TITLE}', track.title))))].map(normalizeCurriculumText)
 }))
 })
}

appendManualDetails(poultryTracks, {
 0: [
 'A written startup operating procedure should cover brooder readiness, feed arrival, water sanitation, and emergency contacts before birds arrive.',
 'Break-even planning should use realistic mortality, feed cost, and farm-gate selling assumptions.',
 'Daily responsibilities should be assigned clearly so biosecurity and brooder checks are consistently executed.'
 ],
 1: [
 'First-week chick observation should translate crowding, panting, silence, and distress into practical management action.',
 'Weak chick assessment should separate transport stress from disease by checking crop fill, hydration, and ambient conditions.',
 'A first-14-day mortality review should record likely cause, corrective action, and recurrence risk.'
 ],
 2: [
 'Weekly body-weight and uniformity tracking should be visible to staff so poor flock performance is noticed early.',
 'Litter, airflow, and drinker management should be reviewed before poor growth is blamed on genetics or feed supply.',
 'Clear intervention thresholds should be set for weight lag, feather condition, droppings change, and feed refusal.'
 ],
 3: [
 'Daily production review should connect output to heat, water pressure, shell quality, and flock behavior.',
 'An acceptable production day should be defined in numbers so supervisors can detect abnormal performance quickly.',
 'A response sequence for sudden production drop should begin with water, feed, heat, and disease signs before supplier complaints are considered.'
 ],
 4: [
 'Buyer categories should distinguish dependable cashflow channels, premium channels, and opportunistic channels.',
 'Scale decisions should be tied to a restart rule that separates expansion from system correction.',
 'Margin review should distinguish operational excellence from temporary price advantage.'
 ]
})

appendManualDetails(sheepTracks, {
 0: [
 'The breed-improvement objective should be framed around fertility, lamb survival, growth, carcass value, and climate resilience.',
 'Foundation ewes should be assessed for mothering quality, disease history, feet, body-condition recovery, and lamb performance.',
 'The breeding core should exclude weaknesses that cannot be managed economically.'
 ],
 1: [
 'Mating groups should be explained by purpose, ram assignment, and expected breeding outcome.',
 'Breeding-season labor, feed, fencing, and records should be prepared before ram release.',
 'Pre-breeding review should determine which animals are retained, culled, isolated, or deferred.'
 ],
 2: [
 'Pregnancy management should be treated as a survival and growth investment rather than a waiting period.',
 'Response plans should cover late-pregnancy weight loss, abortion risk, and lambing stress before they occur.',
 'A successful breeding season should be measured through conception, births, recovery, and replacement quality.'
 ],
 3: [
 'Neonatal management should cover first-hour checks, colostrum confirmation, mother-young bonding, and weak-lamb escalation.',
 'Retention decisions should distinguish parasite pressure, underfeeding, exposure stress, and genetic weakness.',
 'Lamb growth tracking should identify weak health status and underperforming genetic lines.'
 ],
 4: [
 'Sale classes should reflect weight, structure, breeding potential, and health score.',
 'Flock growth should be reviewed as a multi-season program rather than a one-market outcome.',
 'Expansion should depend on clear performance evidence, not optimism.'
 ]
})

appendManualDetails(goatTracks, {
 0: [
 'Resilience genetics should be presented as commercially valuable under parasite pressure, feed stress, and weak housing conditions.',
 'Foundation does should be scored on kidding history, udder quality, parasite resilience, feet, and market-kid output.',
 'Growth improvement should not come at the cost of core resilience.'
 ],
 1: [
 'Buck selection should balance frame, fertility, adaptation, and market fit.',
 'Buck quarantine, observation, and breeding-readiness procedures should be defined before introduction to the flock.',
 'Breeding groups should match a clear output target such as market kids, replacement females, or terminal offspring.'
 ],
 2: [
 'Kidding-risk planning should cover weak kids, twins, doe exhaustion, cold stress, and labor escalation.',
 'Late-trimester feed, water, and pen adjustments should be planned to reduce avoidable kid loss.',
 'Module success should be measured through kid survival and doe recovery, not only visible kidding events.'
 ],
 3: [
 'Managers should be able to distinguish worm burden, respiratory stress, and nutritional lag in growing kids.',
 'Weekly kid review should guide treatment, separation, and closer performance monitoring.',
 'Parasite-risk planning should follow rainfall, browsing pressure, and paddock hygiene patterns.'
 ],
 4: [
 'Sale batches should be built by weight and body condition so buyers see consistency.',
 'Flock strategy should compare income from replacement quality, breeding stock, and meat sales.',
 'Expansion should be justified through kidding rate, kid survival, market acceptance, and labor readiness.'
 ]
})

appendManualDetails(cattleTracks, {
 0: [
 'The commercial case should preserve adapted cow lines while improving frame and carcass performance through selected sires.',
 'Foundation cows should be scored for fertility, calving ease, calf survival, temperament, and drought-season performance.',
 'Visible size gains should be judged against maintenance cost and market advantage.'
 ],
 1: [
 'Herd-grouping rules should prevent random breeding and give each bull assignment a measurable improvement purpose.',
 'Water planning, mineral access, and grazing movement should be integrated into the breeding-season plan.',
 'Bull readiness should be checked through feet, condition, reproductive behavior, and health before service begins.'
 ],
 2: [
 'Calving preparedness should define labor roles, calf-support materials, emergency referral contacts, and postpartum follow-up timing.',
 'Pregnancy success should be reviewed through calf vigor, dam recovery, and rebreeding readiness, not simply birth outcome.',
 'Clear response steps should exist for calving delay, weak calves, retained placenta, and poor maternal behavior.'
 ],
 3: [
 'The weekly herd-health walk should capture tick pressure, coat condition, manure change, gait, appetite, and calf behavior.',
 'Disease pressure should be separated from poor forage, water stress, and handling stress before major conclusions are drawn.',
 'Calf-growth data should clarify whether management, genetics, or environment is limiting performance.'
 ],
 4: [
 'Market animals should be graded by class, frame, finish, and health reliability.',
 'Herd scaling should be treated as a capital-allocation decision backed by feed security, labor strength, and stable reproductive data.',
 'Post-season review should determine whether the herd is truly improving or only surviving.'
 ]
})

;[poultryTracks, sheepTracks, goatTracks, cattleTracks].forEach((group) => {
 Object.values(group).forEach((track) => {
 track.modules = (track.modules || []).map((m) => ({
 ...m,
 name: normalizeModuleHeading(m.name),
 summary: normalizeCurriculumText(m.summary),
 details: (m.details || []).map(normalizeCurriculumText)
 }))
 track.breeds = (track.breeds || []).map(normalizeCurriculumText)
 track.kpis = (track.kpis || []).map(normalizeCurriculumText)
 })
})

const paymentProviders = {
 GH: ['MTN MoMo', 'Vodafone Cash', 'AirtelTigo Money'],
 NG: ['OPay', 'PalmPay', 'Paga'],
 BF: ['Orange Money', 'Moov Money']
}
const currencyByCountry = { GH: 'GHS', NG: 'NGN', BF: 'XOF' }
const fxByCurrency = { USD: 1, GHS: 15, NGN: 1600, XOF: 610 }
const universityProducts = ['poultry', 'sheep', 'goat', 'cattle']
const AADU_FULL_NAME = 'African Agricultural Digital University'
const AADU_SHORT_NAME = 'AADU'
const homeUniversityShowcase = [
 { key: 'poultry', title: 'Poultry University', route: 'poultry-university', summary: 'Applied training for layers, broilers, and guinea fowl, with operating guidance for flock setup, health control, production routines, and sales planning.', accessLabel: 'Open Poultry University' },
 { key: 'sheep', title: 'Sheep University', route: 'sheep-university', summary: 'Structured sheep production and breed-development learning focused on breeding systems, lamb survival, parasite control, and market-ready flock improvement.', accessLabel: 'Open Sheep University' },
 { key: 'goat', title: 'Goat University', route: 'goat-university', summary: 'Practical goat training covering adapted breed improvement, kidding performance, parasite pressure, browse strategy, and commercial herd management.', accessLabel: 'Open Goat University' },
 { key: 'cattle', title: 'Cattle University', route: 'cattle-university', summary: 'Professional cattle learning built around herd improvement, breeding discipline, calf survival, health scheduling, and stronger commercial decision-making.', accessLabel: 'Open Cattle University' },
]
const emptyUniversitySubscription = { tier: 'free', subscription: null, plans: [] }
const livestockBreedOptions = {
 SHEEP: ['Dorper', 'Merino', 'Sahel', 'Djallonké', 'West African Dwarf', 'Cross'],
 GOAT: ['Boer', 'Saanen', 'Anglo-Nubian', 'Sahelian', 'West African Dwarf', 'Cross'],
 CATTLE: ['Holstein', 'Jersey', 'Boran', "N'Dama", 'White Fulani', 'Cross'],
 POULTRY: ['Broiler', 'Layer', 'Noiler', 'Kuroiler', 'Local', 'Cross'],
}

const livestockRaisedByDamOptions = ['Yes', 'No', 'Unknown']
const livestockDnaOptions = ['Not tested', 'Parentage verified', 'Genomics available']


const buildOffspringDraftFromParent = (parent) => {
 if (!parent) return null
 const species = String(parent.species || 'SHEEP').toUpperCase()
 const childType = species === 'GOAT' ? 'DOE' : (species === 'CATTLE' ? 'HEIFER' : (species === 'POULTRY' ? 'CHICK' : 'EWE'))
 const parentType = String(parent.animal_type || '').toUpperCase()
 const isMaleParent = ['RAM','BUCK','BULL','COCKEREL','ROOSTER'].includes(parentType)
 return {
  ownership: parent.ownership || 'OWNED',
  species,
  animal_type: childType,
  name: '',
  ear_tag: '',
  farm_id: '',
  registration_number: '',
  date_of_birth: '',
  acquisition_date: '',
  purchased_from: parent.purchased_from || '',
  purchased_from_type: 'BREEDER',
  purchase_price: '',
  currency: parent.currency || 'GHS',
  stars: '0',
  initial_weight_kg: '',
  sire_id: isMaleParent ? (parent.id || parent.name || '') : (parent.sire_id || ''),
  dam_id: isMaleParent ? (parent.dam_id || '') : (parent.id || parent.name || ''),
  litter_size: '1',
  breeding_type: parent.breeding_type || '',
  health_status: parent.health_status || '',
  pen_location: parent.pen_location || '',
  castrated: false,
  cull_keep_status: '',
  cull_reason: '',
  sale_date: '',
  sale_price: '',
  sold_to: '',
  died_date: '',
  treatment_entry: '',
  notes: parent.id ? `Offspring record linked to parent ${parent.id}` : 'Offspring record linked to current parent',
  user_id: parent.user_id || '',
 }
}

const livestockMedicineOptions = {
 SHEEP: {
  species: ['Albenor 2.5% suspension - Albendazole dewormer', 'PPR vax', 'Tsetsefly Shot', 'Vitamin And Antibiotic & Flea Treatment'],
  other: ['5-Way', 'Blackleg 7-Way', 'BO-SE', 'Brucellosis', 'CDT', 'Dexamethasone', 'Excenel', 'LA-200/Oxytetracycline', 'Nuflor', 'Penicillin', 'Pinkeye', 'Trichomoniasis'],
 },
 GOAT: {
  species: ['Albendazole drench', 'PPR vax', 'CCPP treatment', 'Vitamin and antibiotic support'],
  other: ['CDT', 'Ivermectin', 'Oxytetracycline', 'Penicillin', 'Sulfa treatment', 'Dewormer'],
 },
 CATTLE: {
  species: ['Blackleg vaccine', 'Lumpy Skin support', 'Tick fever treatment', 'Vitamin and mineral support'],
  other: ['5-Way', 'BO-SE', 'Brucellosis', 'Dexamethasone', 'Excenel', 'LA-200/Oxytetracycline', 'Nuflor', 'Penicillin', 'Pinkeye', 'Trichomoniasis'],
 },
 POULTRY: {
  species: ['Newcastle vaccine', 'Gumboro vaccine', 'Coccidiosis treatment', 'Vitamin stress pack'],
  other: ['Amprolium', 'Enrofloxacin', 'Multivitamins', 'Oxytetracycline soluble', 'Probiotics', 'Tylosin'],
 },
}


const livestockHistoryRows = (record) => {
 if (!record) return []
 const notesCount = record.notes ? 1 : 0
 const medsCount = record.treatment_entry ? 1 : 0
 const offspringCount = Number(record.litter_size || 0)
 return {
 history: [
 ['Notes', `(${notesCount})`, 'notes'],
 ['Add Note', '›', 'add-note'],
 ['Add Weight', '›', 'add-weight'],
 ['Medicines', `(${medsCount})`, 'medicines'],
 ['Add Medicine', '›', 'add-medicine'],
 ['Add FAMACHA/Body Condition Score', '›', 'famacha'],
 ['View Ancestor Tree', '›', 'ancestor-tree'],
 ['Share PDF Report', '›', 'share-pdf'],
 ['View Offspring Report', '›', 'offspring-report'],
 ],
 offspring: [
 [`Offspring`, `(${offspringCount})`, 'offspring-list'],
 ['Add Lamb', '›', 'add-lamb'],
 ],
 marks: [
 ['Add Mark', '›', 'add-mark'],
 ['Add Flush', '›', 'add-flush'],
 ['Add Ultrasound', '›', 'add-ultrasound'],
 ],
 photosDocs: [
 ['Add Photo', '›', 'add-photo'],
 ['Add Doc', '›', 'add-doc'],
 ],
 herd: [
 ['Move to Different Herd', '›', 'move-herd'],
 ]
 }
}

const livestockDetailRows = (record) => {
 if (!record) return []
 return [
 ['Name / Tag #', record.name || record.id || '--'],
 ['Labels', record.labels || 'None'],
 ['EID / RFID', record.ear_tag || '--'],
 ['Scrapie Tag', record.farm_id || '--'],
 ['Registration #', record.registration_number || '--'],
 ['Reg. Name', record.name || '--'],
 ['Breed', record.breeding_type || '--'],
 ['Breeder', record.purchased_from || '--', 'breeder'],
 ['Stars', String(record.stars ?? '--')],
 ['Sex', record.animal_type || '--'],
 ['Born', record.date_of_birth ? String(record.date_of_birth).slice(0,10) : '--'],
 ['Acquired', record.acquisition_date ? String(record.acquisition_date).slice(0,10) : '--'],
 ['Sold To', record.sold_to || '--'],
 ['Sire', record.sire_id || '--'],
 ['Dam', record.dam_id || '--'],
 ['Dam-Sire', record.farm_id || '--'],
 ['Litter Size', record.litter_size ?? '--'],
 ['DNA', record.registration_number || '--'],
 ['Initial Weight', record.initial_weight_kg ? `${record.initial_weight_kg} kg` : '--'],
 ['Initial Notes', record.notes || '--'],
 ['Breeding Type', record.health_status || '--'],
 ['Castrated', record.castrated ? 'Yes' : 'No'],
 ['Sale Date', record.sale_date ? String(record.sale_date).slice(0,10) : '--'],
 ['Sale Price', record.sale_price || '--'],
 ['Sale Desc', record.pen_location || '--'],
 ['Winnings', record.treatment_entry || '--'],
 ['Died', record.died_date ? String(record.died_date).slice(0,10) : '--'],
 ['Breed With', record.cull_reason || '--'],
 ['Should Be Culled', record.cull_keep_status || '--'],
 ]
}


const professionalOutcomeBenchmarks = {
 poultry: ['Flock readiness score', 'Health-compliance score', 'Feed-efficiency watchpoints', 'Market margin review'],
 sheep: ['Breeding-discipline score', 'Lamb survival score', 'Parasite-control score', 'Replacement quality review'],
 goat: ['Doe productivity score', 'Kid survival score', 'Parasite-risk score', 'Market batch readiness'],
 cattle: ['Herd fertility score', 'Calf survival score', 'Tick-control score', 'Commercial growth review']
}

const poultryProDownloads = [
 {
  title: 'Download Operating Playbook',
  filename: 'Poultry-Operating-Playbook.txt',
  content: `Poultry University Professional
Operating Playbook

This playbook is meant to sit beside the manager or owner during a live cycle. It focuses on keeping the flock stable, protecting margin, and knowing what to review before a small issue becomes an expensive one.

1. Weekly operating review
- Confirm total birds placed, current live count, mortality to date, and culls this week.
- Compare feed delivered versus feed consumed and inspect for wastage at feeder level.
- Check water reliability, drinker cleanliness, and any time periods with weak pressure.
- Review litter condition, smell, wet spots, and ammonia complaints by pen or section.
- Record temperature and ventilation observations by time of day, not only once.
- Note any egg-quality change, drop in lay, slow gain, or uneven birds.

2. House walk routine
- Enter quietly and watch bird behavior before disturbing the flock.
- Look for crowding, panting, wing spreading, huddling, isolated weak birds, and empty feeder lines.
- Walk all corners, not just the center aisle.
- Check drinker height, feeder height, leaks, and dark or poorly ventilated spots.
- Pull a sample of birds by hand to judge crop fill, body condition, feather cover, and leg quality.

3. Track-specific operating focus
Layers
- Protect pullet uniformity before first lay; do not chase early eggs with weak body frame.
- Review tray count, shell quality, cracked eggs, feed intake, and water intake together.
- Investigate a drop in production with light program, heat stress, disease signs, and feed consistency before blaming breed.

Broilers
- Monitor daily gain, FCR trend, floor condition, and mortality pattern by house section.
- Fast growth is only useful when legs, airflow, and litter quality stay under control.
- If birds are sitting excessively, check heat load, wet litter, feeder crowding, and waterline access immediately.

Guinea fowl
- Keet survival discipline matters more than ambitious expansion.
- Review shelter security, predator exposure, return-to-house routine, and weather protection every day.
- Separate timid or weaker groups early so feed competition does not hide poor birds.

4. Traffic-light decision system
Green
- Mortality on target, feed intake normal, birds evenly spread, no major litter or shell-quality complaints.
- Action: continue current routine and log the week cleanly.

Amber
- Slight mortality rise, uneven growth, damp litter zones, slower egg pickup, noisy birds at night, or minor heat signs.
- Action: inspect water, feeder space, ventilation, and disease signals the same day. Re-check within 24-72 hours.

Red
- Sharp mortality spike, birds off feed, sudden shell-quality collapse, repeated panting, strong ammonia, or visible neurological/respiratory signs.
- Action: isolate weak birds, tighten biosecurity, document symptoms, and escalate to veterinary support quickly.

5. Margin protection rules
- Do not change too many things at once. Make one correction, then re-measure.
- Count losses in money terms: mortality cost, wasted feed, downgraded eggs, undersized birds, delayed sales.
- Delay expansion when one cycle is unstable; scaling a weak system only multiplies loss.
- Keep weekly notes good enough for a lender, partner, or manager handover.

6. End-of-cycle review
- Compare plan versus actual for placement, survival, feed use, output, and sales.
- List the three most expensive mistakes and the three best decisions.
- Carry one management improvement into the next cycle instead of changing everything at once.`
 },
 {
  title: 'Download Layer Cashflow Pack',
  filename: 'Poultry-Layer-Cashflow-Pack.txt',
  content: `Poultry University Professional
Layer Cashflow + Egg Quality Pack

1. Daily dashboard
- Birds in lay:
- Eggs collected today:
- Trays sold today:
- Cracks / rejects:
- Feed used today:
- Water interruptions:
- Mortality today:
- Peak house temperature:

2. Egg quality watchpoints
- Thin shells: review calcium source, water intake, heat load, and flock age.
- Dirty eggs: inspect nest hygiene, litter carryover, crowding, and collection frequency.
- Small eggs: check flock age, body weight history, feed consistency, and disease pressure.
- Sudden quality drop: review heat events, vaccination stress, water quality, and ration change timing.

3. Weekly management questions
- Are pullets entering lay with enough frame and body condition?
- Is production drop tied to one pen, one feed batch, or the whole house?
- Are cracked eggs rising because of shell weakness, rough handling, or delayed collection?
- Did heat or water interruptions happen at the same time as the output decline?

4. Cashflow discipline
- Separate top-grade trays, mixed-grade trays, and reject eggs in the record book.
- Track price by buyer channel instead of averaging every sale together.
- Review whether credit sales are delaying the working capital needed for feed.
- Protect continuity of supply; dependable weekly delivery often matters more than one high-price day.

5. Corrective sequence when lay weakens
1. Confirm bird age, body condition, and production history.
2. Check water intake pattern and line function.
3. Review light program consistency.
4. Inspect feed delivery, storage, and particle quality.
5. Walk the house for heat stress, shell issues, and signs of disease.
6. Escalate unusual drops with local veterinary support when management checks do not explain the decline.`
 },
 {
  title: 'Download Broiler Margin Recovery Plan',
  filename: 'Poultry-Broiler-Margin-Recovery-Plan.txt',
  content: `Poultry University Professional
Broiler Margin Recovery Plan

1. The four numbers to review first
- Current liveability
- Average body weight by sample
- Feed conversion trend
- Average realized sale price by batch

2. Where broiler margin usually leaks
- Feed wastage from wrong feeder height or overfilling
- Wet litter reducing comfort, growth, and leg quality
- Delayed sale causing extra feed days without enough price gain
- Uneven birds forcing discounting at market
- Heat stress reducing intake during key growth days

3. Fast response checklist
- Sample weights from different corners of the house
- Re-check stocking density and feeder/drinker access
- Fix water leaks before adding litter on top of a wet problem
- Review ventilation pattern during the hottest part of the day
- Separate weak birds so they do not hide inside average performance

4. Sale planning rules
- Build market batches by real weight, not guesswork.
- Do not hold a full flock for the lightest birds.
- Negotiate buyer timing early when birds are close to target weight.
- Keep transport stress and loading losses inside the margin review.

5. Post-mortem review after each cycle
- Which day range had the biggest performance loss?
- Was the main issue feed, heat, health, equipment, or market delay?
- What one correction would most likely improve the next batch?`
 },
 {
  title: 'Download Guinea Fowl Field Guide',
  filename: 'Poultry-Guinea-Fowl-Field-Guide.txt',
  content: `Poultry University Professional
Guinea Fowl Field Guide

1. Keet survival priorities
- Pre-warm the brooding space and remove drafts before arrival.
- Keep bedding dry and safe from chilling.
- Watch shy feeders closely; guinea keets can look active while still under-consuming.
- Reduce crowding around water and feed points.

2. Behavior management
- Train birds to a reliable return-to-house routine before allowing wider ranging.
- Keep predictable feeding times.
- Avoid rough handling that causes panic piling and injury.
- Review predator exposure at dusk, not only during daytime.

3. Weather discipline
Humid conditions
- Protect against wet litter, moldy feed, and damp night housing.
- Keep drainage and roof integrity under regular review.

Dry conditions
- Prioritize shade, water security, and low-stress handling in afternoon heat.
- Watch for long walking distances that drain condition before sale.

4. Market notes
- Separate breeder-quality birds, meat birds, and cull birds early.
- Keep buyers informed about flock age and average size; guinea buyers often pay for consistency.
- Premium seasonal demand is easiest to capture when mortality and losses are already controlled.

5. Trouble signs that deserve fast action
- Birds refusing to return to shelter
- Repeated piling or panic flight
- Keets appearing active but falling behind in weight
- Sudden predator losses
- Wet, cold, or drafty housing after rain`
 },
 {
  title: 'Download Printable Manager Toolkit',
  filename: 'Poultry-Printable-Manager-Toolkit.txt',
  content: `Poultry University Professional
Printable Manager Toolkit

A. Daily house walk sheet
Date:
House / batch:
Bird age:
Observer:

- Feed available in all lines? Yes / No
- Water flowing well? Yes / No
- Birds evenly spread? Yes / No
- Panting / huddling seen? Yes / No
- Wet litter or ammonia zone? Yes / No
- Sick / weak birds isolated? Yes / No
- Mortality count:
- Notes:

B. Weekly review sheet
Week ending:
- Opening live count:
- Current live count:
- Weekly mortality:
- Feed used:
- Egg trays / average sale weight:
- Buyer issues:
- Equipment issues:
- Main risk for next week:
- Action owner:

C. Batch decision log
- Keep current plan
- Correct feed / water setup
- Correct ventilation or litter issue
- Delay expansion
- Escalate health concern
- Prepare sale window

D. Escalation note template
Problem observed:
First noticed:
Affected house / age:
Immediate actions taken:
What changed after 24 hours:
Local vet / advisor contacted:
Final recommendation:`
 },
 {
  title: 'Download Printable Vaccination Schedule',
  filename: 'Poultry-Printable-Vaccination-Schedule.txt',
  content: `Poultry University Professional
Printable Vaccination + Health Compliance Schedule

Use this schedule only as an operating template. Final timing, brands, routes, dilution, and booster decisions must be confirmed with licensed local veterinary authorities.

Batch / house:
Placement date:
Track: Layers / Broilers / Guinea Fowl
Zone: Humid / Dry
Manager:

1. Pre-placement compliance
- House washed and disinfected: Yes / No
- Downtime completed: ____ days
- Rodent / vector control completed: Yes / No
- Vaccine storage temperature checked: Yes / No
- Hatchery declaration received: Yes / No

2. Vaccination schedule board
- Day 0-1: hatchery vaccination declaration confirmed
- Day 5-7: Newcastle prime
- Day 10-14: IBD/Gumboro first dose where indicated
- Day 18-24: ND/IBD booster per veterinary directive
- Week 6-8: Fowl pox / region-specific program where indicated
- Ongoing: coccidiosis, deworming, and sanitation review by risk profile

3. Compliance log fields
Date:
Product / batch number:
Bird age:
Route:
Dilution / dose note:
Cold-chain verified by:
Administered by:
Observed reaction / notes:

4. Failure review prompts
- Was the product genuine and inside temperature range?
- Was dilution or waterline preparation done correctly?
- Were birds under unusual heat, transport, or disease stress?
- Are records clear enough for veterinary review?`
 },
 {
  title: 'Download Expert Q&A Field Workbook',
  filename: 'Poultry-Expert-QA-Field-Workbook.txt',
  content: `Poultry University Professional
Expert Q&A Field Workbook

Use this workbook before calling an advisor, vet, manager, lender, or buyer. The goal is to arrive with clear facts, not vague complaints.

1. Core flock facts
- Track:
- Age / week:
- Current live count:
- Recent mortality:
- Feed phase:
- Water issue in last 7 days? Yes / No
- Weather stress in last 7 days? Yes / No

2. Problem framing
Describe the problem in one sentence:
When did it start?
What changed in the 72 hours before it started?
What has already been tried?

3. Management review prompts
- Is the issue one pen, one house, or the whole flock?
- Are birds off feed, off water, uneven, or mainly stressed by heat?
- Did vaccination, transport, ration, litter, or buyer timing change recently?
- What records can prove the trend is real?

4. Advisor-ready questions
- What is the most likely root cause sequence here?
- What should be checked today, this week, and before the next cycle?
- What would trigger urgent veterinary escalation?
- Which single correction gives the highest chance of recovering margin?

5. Decision record
Advice received:
Action chosen:
Who owns the action:
Re-check date:
Result after re-check:`
 }
]

const poultryProModuleDeepDives = {
 layers: [
  {
   title: 'Professional Layer Launch Checklist',
   cadence: 'Before chicks arrive and during the first 7 days',
   checklist: [
    'Approve one written startup budget that covers chicks, 6-8 weeks of feed, water backup, litter, heat, and emergency medicine before placement.',
    'Stress-test biosecurity flow: entry point, footbath refresh rule, dead-bird route, waste route, and visitor restriction must be clear to workers.',
    'Check house readiness with thermometer, weighing scale, spare drinkers/feeders, and at least one contingency heat source.',
    'Prepare a first-week dashboard for mortality, crop fill, water availability, and chick behavior by time of day.'
   ],
   managerNotes: 'The professional standard is to arrive prepared enough that the first week feels controlled, not improvised.'
  },
  {
   title: 'First-14-Day Control Priorities',
   cadence: 'Daily',
   checklist: [
    'Audit chick spread, crop fill, drinker access, and signs of chilling or overheating morning, afternoon, and evening.',
    'Separate weak birds early instead of letting them disappear inside the flock average.',
    'Write down any hatchery, transport, or brooder issue in a daily correction log so preventable losses are not repeated next cycle.',
    'Confirm vaccination declaration, water sanitation, and brooder-temperature consistency before blaming chick quality.'
   ],
   managerNotes: 'Early mortality rarely comes from one cause. Professionals review hatchery quality, transport stress, temperature, water, and handling as one chain.'
  },
  {
   title: 'Grower Uniformity and Frame Build SOP',
   cadence: 'Weekly',
   checklist: [
    'Sample weights by section and compare against one target chart instead of relying on visual judgement.',
    'Review lighting discipline, feed-phase change timing, and litter dryness together whenever body-weight spread widens.',
    'Hold pullets back from premature stimulation if frame and uniformity are still weak.',
    'Escalate recurring unevenness into a root-cause review covering feeder space, disease pressure, and waterline performance.'
   ],
   managerNotes: 'Good layer farms protect body frame before chasing early eggs. Weak frame today becomes shell and persistency trouble later.'
  },
  {
   title: 'Peak Lay and Egg Quality Margin Controls',
   cadence: 'Daily + weekly margin review',
   checklist: [
    'Track trays, cracked eggs, shell quality complaints, feed use, water intake, and heat events in one dashboard.',
    'Check collection frequency, nest hygiene, and rough handling before concluding shell weakness alone is the issue.',
    'Flag any drop in lay against the same-week light program, water reliability, ration quality, and disease signs.',
    'Protect buyer confidence by separating top-grade, mixed-grade, and reject trays in the sales log.'
   ],
   managerNotes: 'A professional egg business wins by consistency. Buyers forgive a small farm faster than an inconsistent farm.'
  },
  {
   title: 'Sales, Records, and Scale Gate',
   cadence: 'End of week and end of cycle',
   checklist: [
    'Review gross margin per tray after feed, mortality, medicine, labor, and reject losses—not revenue alone.',
    'Compare buyer channels by payment speed, volume reliability, and complaint rate.',
    'Delay expansion until two or three stable cycles show acceptable mortality, shell quality, and cashflow discipline.',
    'Preserve one operating review pack that could be shown to a partner, lender, or manager takeover.'
   ],
   managerNotes: 'Scaling before the record system is clean usually multiplies confusion faster than profit.'
  }
 ],
 broilers: [
  {
   title: 'Cycle Planning and Buyer Lock-In',
   cadence: 'Pre-placement',
   checklist: [
    'Define target sale weight, expected harvest window, backup buyers, and transport plan before chicks are ordered.',
    'Secure feed supply continuity for the whole cycle instead of hoping to buy opportunistically during growth.',
    'Set one close-cycle review template that tracks mortality, FCR trend, average weight, and realized price by batch.'
   ],
   managerNotes: 'The broiler margin is often decided before day 1—by feed security, sale planning, and how disciplined the operator is about timing.'
  },
  {
   title: 'Brooding Precision Command Sheet',
   cadence: 'Hours 4, 8, 24 and then daily',
   checklist: [
    'Measure crop fill and chick spread on a schedule, not only when birds look wrong.',
    'Adjust heat and airflow from behavior, not from one thermometer reading alone.',
    'Fix dead zones, drafts, and feeder/drinker crowding before they become invisible growth penalties.'
   ],
   managerNotes: 'Professionals know weak brooding shows up later as bad FCR, uneven harvest weights, and unexplained mortality.'
  },
  {
   title: 'Grow-Out Margin Protection',
   cadence: 'Twice weekly',
   checklist: [
    'Sample weights from different house sections and compare with feed consumed so far.',
    'Correct feeder height, overfilling, water leaks, and wet litter before blaming the ration.',
    'Map afternoon heat-stress risk and adjust airflow, shade, or cool-water timing before birds slow down.'
   ],
   managerNotes: 'Every unnoticed litter, airflow, or stocking issue quietly taxes the margin.'
  },
  {
   title: 'Emergency Disease and Mortality Response',
   cadence: 'Immediate when triggered',
   checklist: [
    'Record first signs, affected age, recent changes, and dead-bird count before treatment decisions get noisy.',
    'Stop unnecessary movement between houses and isolate weak birds fast.',
    'Review vaccination timing, water quality, litter condition, and recent weather stress while veterinary escalation is underway.'
   ],
   managerNotes: 'The first disciplined 2 hours usually matter more than the tenth opinion on what the disease might be.'
  },
  {
   title: 'Harvest, Settlement, and Next-Cycle Upgrade',
   cadence: 'End of cycle',
   checklist: [
    'Harvest in weight classes so stronger birds are not priced down by weaker birds.',
    'Capture transport shrink, loading losses, and buyer deductions in the close-out review.',
    'Carry one proven correction into the next cycle instead of restarting the system from zero.'
   ],
   managerNotes: 'A strong broiler operator learns the same cycle twice: once while growing it, once while reviewing it.'
  }
 ],
 guinea: [
  {
   title: 'Guinea Business Model Discipline',
   cadence: 'Pre-placement and monthly',
   checklist: [
    'Commit to meat, breeder, or mixed-market positioning before flock size increases.',
    'Buy only from sources that can explain hatch quality, age, and prior handling.',
    'Plan predator control and return-to-house routine as core infrastructure, not optional extras.'
   ],
   managerNotes: 'Guinea farms get into trouble when enthusiasm outruns handling systems.'
  },
  {
   title: 'Keet Survival Control Board',
   cadence: 'Daily in the first weeks',
   checklist: [
    'Confirm brooder warmth, dryness, shallow drinkers, and feed access before keets settle.',
    'Watch for shy or under-consuming keets that still look active at a distance.',
    'Treat any chill, draft, or crowding issue as urgent because guinea losses compound quickly.'
   ],
   managerNotes: 'The premium guinea operator protects survival first and growth second.'
  },
  {
   title: 'Behavior, Stress, and Range Management',
   cadence: 'Daily + weekly review',
   checklist: [
    'Keep fixed feeding times and a stable return-to-house pattern.',
    'Split aggressive or weak groups early so panic behavior does not become a repeated loss source.',
    'Audit afternoon shade, water distance, and fence integrity before seasonal heat or predation worsens.'
   ],
   managerNotes: 'Behavior management is commercial management in guinea systems.'
  },
  {
   title: 'Health and Biosecurity Enforcement',
   cadence: 'Weekly with immediate response triggers',
   checklist: [
    'Pair local veterinary vaccine guidance with strong sanitation, perimeter hygiene, and wild-bird exclusion.',
    'Monitor parasite pressure and deworm from risk plus symptoms instead of random routine.',
    'Escalate wet-housing, damp feed, respiratory stress, or sudden piling behavior immediately.'
   ],
   managerNotes: 'Most preventable guinea setbacks start as “small” housing or perimeter problems.'
  },
  {
   title: 'Premium Sales and Controlled Scaling',
   cadence: 'Per batch review',
   checklist: [
    'Sort breeder-quality, meat birds, and culls before sale conversations begin.',
    'Sell consistency—age band, average size, survival discipline—not just bird count.',
    'Scale only after losses, predator control, and buyer repeatability are stable.'
   ],
   managerNotes: 'Premium pricing depends on consistency and trust more than one lucky festive sale.'
  }
 ]
}

const poultryProQaPrompts = [
 'Why did mortality rise after rain even though feed did not change?',
 'What should I check first when birds are panting heavily at noon?',
 'How do I know if a drop in egg production is feed, water, heat, or disease?',
 'What records should I show a buyer or lender before scaling my flock?',
 'When should I hold expansion and fix management before buying another batch?'
]

const poultryGuidancePlaybooks = {
 mortality: { title: 'Mortality spike playbook', focus: 'Stabilize birds first, then separate management, environment, and disease causes.', actions: ['Walk the house immediately and note whether birds are huddling, panting, isolated, or crowding around water.', 'Isolate visibly weak birds, remove dead birds quickly, and tighten traffic control into the house.', 'Check brooding temperature or house heat pattern, water flow, litter condition, and feeder access before changing feed.', 'Review the last 72 hours for feed change, vaccine event, weather swing, transport stress, or water interruption.'], escalate: 'Escalate fast if mortality is rising sharply, birds are off feed, or respiratory / neurological signs are visible.' },
 feed: { title: 'Feed efficiency and FCR reset', focus: 'Recover margin by fixing access, wastage, and timing before blaming formulation.', actions: ['Sample bird weight and compare it with feed used so far instead of judging by visual size alone.', 'Correct feeder height, overfilling, and crowding at busy periods.', 'Inspect for water leaks, wet litter, and heat stress reducing intake discipline.', 'Change one thing at a time and re-measure within 72 hours.'], escalate: 'Escalate when feed intake collapses suddenly or growth keeps slipping after house-level fixes.' },
 vaccine: { title: 'Vaccination and health compliance check', focus: 'Make sure timing, cold chain, and records are disciplined before assuming vaccine failure.', actions: ['Confirm product, batch, timing, route, and who administered it.', 'Review cold-chain handling and dilution practice.', 'Check whether stress, poor water quality, or concurrent disease pressure may have reduced response.', 'Document the flock signs clearly before asking for veterinary review.'], escalate: 'Escalate when birds are clinically sick, multiple age groups are affected, or vaccination records are incomplete.' },
 market: { title: 'Market readiness and sale planning', focus: 'Turn the flock into saleable batches with less discounting and less last-minute confusion.', actions: ['Grade birds or eggs by quality band instead of treating the whole output as one class.', 'Confirm buyer timing before birds move past the profitable holding window.', 'Track transport, breakage, and reject losses alongside headline price.', 'Keep one backup buyer channel active for slow market weeks.'], escalate: 'Escalate when you are carrying birds too long or quality complaints are repeatedly cutting price.' },
 general: { title: 'Operator guidance', focus: 'Use a simple root-cause sequence and avoid random fixes.', actions: ['Describe the problem in one sentence: mortality, growth, egg quality, heat stress, or market issue.', 'Check environment, water, feed access, and records before making a big change.', 'Apply one correction, then re-measure quickly.', 'Write down what changed so the next decision is based on evidence.'], escalate: 'Escalate when symptoms are spreading, birds are off feed, or the issue is no longer explainable by routine management.' }
}

const getPoultryGuidancePlaybook = (question='', track='layers', zone='humid') => {
 const q = String(question || '').toLowerCase()
 const key = q.includes('mortality') || q.includes('death') ? 'mortality'
  : (q.includes('feed') || q.includes('fcr') || q.includes('weight')) ? 'feed'
  : (q.includes('vaccine') || q.includes('vaccin') || q.includes('disease') || q.includes('cough')) ? 'vaccine'
  : (q.includes('market') || q.includes('sell') || q.includes('price') || q.includes('tray')) ? 'market'
  : 'general'
 const trackLabel = track === 'broilers' ? 'Broilers' : track === 'guinea' ? 'Guinea Fowl' : 'Layers'
 const zoneLabel = zone === 'dry' ? 'Dry / Savanna Zone' : 'Humid / Forest Zone'
 return { ...poultryGuidancePlaybooks[key], trackLabel, zoneLabel }
}

const executiveBriefs = {
 poultry: `Poultry University Operating Brief

Professional poultry production succeeds when climate control, feed discipline, vaccination timing, mortality management, and route-to-market are managed as one operating system.

Strategic operator message
- Humid systems need litter dryness, drainage, and mycotoxin discipline.
- Dry systems need heat relief, water security, and airflow reliability.
- The most bankable poultry farms are not the biggest; they are the most consistent by tray, cycle, and margin.`,
 sheep: `Sheep University Professional Operating Brief
Premium Flock Strategy Pack

Overview
This brief gives sheep operators a practical flock-improvement plan they can use internally and share with partners, lenders, managers, and buyers when needed.

Commercial objective
Build a Ghana-adapted sheep enterprise that improves lamb survival, flock fertility, growth consistency, and sale quality without losing the hardiness that keeps the system profitable under local feed, climate, and disease pressure.

Core performance pillars
1. Breeding discipline
- Set one breeding objective per cycle: replacement females, market lamb growth, hardiness, or cross improvement.
- Use rams only after checking structure, feet, fertility signs, growth history, and line consistency.
- Keep ewe groups intentional; random mating destroys clarity and slows improvement.

2. Lamb survival control
- Colostrum timing, birth supervision, early weakness detection, and pen hygiene are profit drivers, not minor tasks.
- Review every lamb death for preventable causes: dystocia, exposure, poor milk supply, infection, or delayed intervention.
- Track survival by sire group and dam line so weak genetics do not hide inside average flock numbers.

3. Parasite and health pressure management
- Treat worm pressure, foot issues, and vaccination timing as management systems with fixed routines.
- In humid zones, parasite discipline can matter more than ambitious breeding plans.
- Escalate fast when body condition, coat quality, appetite, or growth rate start to slide.

4. Growth and market readiness
- Weigh sample lambs regularly and compare progress by age band, not guesswork.
- Grade sale animals by frame, thriftiness, health, and finishing potential.
- Do not hold underperforming lambs too long unless there is a clear recovery margin.

5. Record-led scaling
- The flock earns the right to expand only after two stable cycles with acceptable fertility, low avoidable losses, and consistent sale outcomes.
- Keep breeding, lambing, treatment, mortality, and sale records tight enough to support lender or investor review.

90-day action plan
- Audit ewe condition, ram quality, mortality records, and parasite pressure before the next mating window.
- Remove weak breeders and non-performing lines early.
- Standardize a lambing-kit checklist, neonatal check routine, and treatment log.
- Start a simple weekly dashboard for conception signals, lamb survival, growth samples, and sale candidates.

Strategic review message
- Breed improvement must be backed by records, not animal appearance alone.
- Climate-fit management determines whether genetics translate into farmer profit.
- The strongest systems reduce avoidable loss before chasing larger size.

Boardroom takeaway
A premium sheep business is not defined by owning impressive animals. It is defined by running a disciplined flock system that turns breeding decisions, survival control, and market grading into repeatable commercial results.`,
 goat: `Goat University Operating Brief

A professional goat enterprise depends on kidding survival, parasite discipline, climate-fit browse strategy, and smart sire selection.

Strategic operator message
- WAD resilience must be protected while improving frame and market weight.
- Humid-zone parasite losses can erase the value of better genetics if management is weak.
- Strong goat businesses are built on repeatable kidding and sale batches, not isolated showcase animals.`,
 cattle: `Cattle University Operating Brief

A modern cattle program should be judged by fertility, calf survival, feed-water resilience, and repeatable market weights.

Strategic operator message
- Local adaptation is an asset to preserve, not a weakness to replace.
- Climate adaptation, health schedule discipline, and breeding records create the real productivity gains.
- Scalable cattle systems are built through measured herd improvement, not one-off large animals.`
}


const productModuleOutcomeSummaries = {
 poultry: ['Foundation setup defined', 'Breeding / sourcing standard locked', 'Production routine and climate controls clear', 'Health schedule and loss-response system active', 'Commercial scaling rules and records in place'],
 sheep: ['Breeding objective, flock structure, and ram plan defined', 'Mating groups, flushing plan, and breeder standards locked', 'Pregnancy/lambing routines documented for the next cycle', 'Lamb survival, parasite control, and weak-line response active', 'Sale, retention, and scale rules tied to measurable flock data'],
 goat: ['Commercial breeding goal and adapted base protected', 'Buck-selection gate and mating groups documented', 'Kidding workflow and doe support system prepared', 'Kid survival, parasite, and respiratory watchpoints active', 'Replacement, market batching, and expansion rules measured'],
 cattle: ['Foundation cow base and breeding purpose defined', 'Bull assignment, mating season, and replacement logic locked', 'Pregnancy and calving workflow prepared for crews', 'Calf survival and tick-pressure response system active', 'Herd review, culling, and scaling rules tied to business KPIs']
}

const professionalDownloads = {
 sheep: [
  {
   title: 'Download Sheep Operating Playbook',
   filename: 'Sheep-Operating-Playbook.txt',
   content: `Sheep University Professional
Operating Playbook

This playbook is designed for the owner, flock manager, or lead stockperson who needs a practical weekly rhythm for breeding, lamb survival, parasite control, and market preparation.

1. Weekly flock review
- Confirm ewe count, ram count, lamb count, deaths, culls, and isolated animals.
- Review body condition by breeding group instead of judging the whole flock as one average.
- Check grazing pressure, pen hygiene, water reliability, and mineral access.
- Note abortions, weak lambs, repeat heats, lameness, coughing, and poor appetite immediately.

2. Breeding-season routine
- Keep mating groups intentional and written down.
- Review ram readiness through feet, condition, libido, and visible health before service.
- Remove problem breeders early instead of carrying them for hope.
- Match replacement decisions to fertility, lamb survival, mothering, and growth history.

3. Lamb survival priorities
- Confirm lambing kit, clean pens, colostrum timing, and weak-lamb response plan before the peak lambing window.
- Recheck twins, weak lambs, and poor-milking ewes more than once per day when risk is high.
- Record preventable lamb losses by cause so the next season improves on evidence.

4. Parasite and health discipline
- Treat worm pressure, hoof issues, and vaccination timing as commercial performance risks.
- In humid zones, tighten rotation, drainage, and early treatment triggers.
- Escalate quickly when coat quality, appetite, weight gain, or flock thriftiness drop.

5. Margin protection rules
- Grade sale lambs by true market readiness, not by guesswork or emotion.
- Delay expansion when survival, fertility, or forage security are unstable.
- Review one expensive loss source every cycle and carry one correction into the next round.`
  },
  {
   title: 'Download Sheep Breeding Calendar',
   filename: 'Sheep-Breeding-Lambing-Calendar.txt',
   content: `Sheep University Professional
Breeding + Lambing Calendar

Annual vaccination + deworming guide
- January-February: dry-season review, body condition scoring, mineral support, and targeted deworming only for high-risk groups.
- March-April: pre-rain breeder vaccine window, hoof trimming, drainage fixes, and ram soundness checks.
- May-August: wet-season parasite and pneumonia watch; monitor anemia/scours twice weekly and treat selectively based on need.
- September-October: review lamb growth, worm pressure, and booster needs where local protocol requires.
- November-December: pre-breeding correction, cull chronic poor performers, and reset records.

Recommended vaccine categories
- Core breeder protection: clostridial products (for example CDT or locally approved equivalents) with full primary series for replacements.
- Pre-lambing booster window: usually 2-6 weeks before lambing so lambs receive colostral protection.
- Region-specific option: PPR where national/local programs require it.
- Risk-based option: pneumonia/pasteurellosis vaccination where locally justified.

Recommended deworming approach
- Use targeted selective treatment: prioritize weaned lambs, thin ewes, anemic animals, and groups on short wet pasture.
- Rotate dewormer class by efficacy review, not random brand switching.
- Dose to accurate weight and calibrate drench gun each treatment day.
- Keep some low-risk healthy animals untreated when locally appropriate to slow resistance.

Pre-breeding
- Body condition scoring
- Deworm and mineral correction by risk
- Ram soundness checks and mating-group assignments

Breeding window
- Controlled exposure dates recorded
- Returns to heat logged
- Water, shade, and handling stress kept low

Mid-gestation
- Trimester feed review
- Hoof, parasite, and housing checks
- Weak breeder review

Pre-lambing
- Lambing pens cleaned and stocked
- Birth kit ready
- Night-watch or high-risk supervision plan confirmed

Lambing phase
- Colostrum within hours
- Weak-lamb intervention notes
- Dam mothering review

Post-lambing
- Growth sampling
- Replacement and cull notes
- Sale candidate grouping

Caution
- Verify product label, dose, route, booster interval, and withdrawal period with a local veterinarian before treatment.`
  },
  {
   title: 'Download Sheep Flock Review Workbook',
   filename: 'Sheep-Flock-Review-Workbook.txt',
   content: `Sheep University Professional
Flock Review Workbook

Use this before meeting a buyer, lender, manager, or veterinary advisor.

1. Flock snapshot
- Ewes exposed:
- Rams used:
- Lambs born:
- Lambs weaned:
- Deaths / culls:

2. Breeding review
- Which sire groups conceived best?
- Which ewe lines repeatedly underperform?
- What one trait are we improving next cycle?

3. Survival review
- Most expensive preventable loss:
- Main lamb weakness trigger:
- What changed after intervention?

4. Commercial review
- Average sale class:
- Best buyer channel:
- Slowest-moving animals:
- One correction before scaling:`
  }
 ],
 goat: [
  {
   title: 'Download Goat Operating Playbook',
   filename: 'Goat-Operating-Playbook.txt',
   content: `Goat University Professional
Operating Playbook

This playbook gives the farm manager a practical way to run breeding, kidding, browse planning, parasite control, and market batching as one operating system.

1. Weekly herd review
- Confirm doe, buck, kid, and isolated-animal counts.
- Review body condition, appetite, coat quality, feet, and browse pressure.
- Check water reliability, pen dryness, and shade or airflow stress.
- Flag coughing, bottle jaw, diarrhea, poor growth, and weak kids immediately.

2. Breeding management
- Assign each buck one improvement purpose: frame, maternal value, twinning, or terminal finish.
- Avoid random buck exposure that destroys record quality.
- Track returns to heat and weak-conception lines early.

3. Kidding and kid-survival control
- Prepare kidding pens, colostrum plan, weak-kid supplies, and doe observation routine before kidding starts.
- Support twins aggressively where milk, weather, or parasite pressure increase risk.
- Record causes of kid loss so the next cycle is smarter than the last one.

4. Parasite and respiratory control
- Haemonchus pressure should trigger routine body-condition and membrane checks.
- CCPP risk needs fast separation, observation, and escalation.
- In humid zones, shelter dryness and browse rotation protect more margin than late treatment alone.

5. Scale rules
- Build sale groups by weight class, thriftiness, and buyer fit.
- Do not expand off one good festive market if kidding survival and worm control are still unstable.
- Protect the adapted maternal base while improving frame and sale value.`
  },
  {
   title: 'Download Goat Kidding + Health Calendar',
   filename: 'Goat-Kidding-Health-Calendar.txt',
   content: `Goat University Professional
Kidding + Health Calendar

Annual vaccination + deworming guide
- January-February: browse planning, mineral support, and selective deworming for thin or anemic groups.
- March-April: pre-rain breeder vaccination window, hoof care, shelter repair, and kidding-area sanitation.
- May-August: humid-season Haemonchus and respiratory watch; run weekly anemia checks and separate cough cases quickly.
- September-October: review kid growth, drench performance, and boosters only where risk/label requires.
- November-December: pre-breeding condition recovery and cull chronic parasite losers.

Recommended vaccine categories
- Core breeder protection: clostridial products such as CDT or locally approved equivalents.
- Pre-kidding booster window: commonly 2-6 weeks before kidding for better kid protection through colostrum.
- Region-specific option: PPR where part of local control programs.
- Risk-based option: CCPP vaccination in endemic areas under veterinary guidance.

Recommended deworming approach
- Base treatment on anemia score, body condition, kid growth, and hotspot groups instead of whole-herd monthly drenching.
- Review benzimidazole, macrocyclic lactone, and levamisole-class options with your veterinarian and rotate by efficacy evidence.
- Keep sheds dry and move goats onto cleaner browse/taller forage faster during wet months.
- Never guess dose from sheep practice; goats may require different label guidance.

Pre-breeding
- Score does and bucks
- Correct minerals and parasite burden
- Repair pens and kidding areas

Breeding window
- Controlled buck rotation
- Mating groups recorded
- Watch return-to-heat animals

Pregnancy
- Trimester feeding plan
- Low-stress handling
- Kidding kit prep

Kidding phase
- Colostrum assurance
- Twin-kid support
- Doe recovery monitoring

Grow-out
- Weigh sample kids
- Watch Haemonchus pressure
- Grade sale and replacement candidates

Caution
- Confirm goat-specific labels, age limits, dose-by-weight, and withdrawal periods before treatment.`
  },
  {
   title: 'Download Goat Margin Review Workbook',
   filename: 'Goat-Margin-Review-Workbook.txt',
   content: `Goat University Professional
Margin Review Workbook

1. Reproduction snapshot
- Does exposed:
- Does kidded:
- Kids born:
- Kids weaned:

2. Health snapshot
- Parasite problem group:
- Respiratory cases:
- Losses this cycle:

3. Commercial review
- Best sale weight band:
- Buyer type:
- Margin per doe exposed:
- Margin per kid weaned:

4. Next-cycle decision
- One line to strengthen:
- One line to remove:
- One management correction before scaling:`
  }
 ],
 cattle: [
  {
   title: 'Download Cattle Operating Playbook',
   filename: 'Cattle-Operating-Playbook.txt',
   content: `Cattle University Professional
Operating Playbook

This playbook is built for herd owners and supervisors managing breeding, calving, feed-water resilience, health pressure, and market preparation across seasons.

1. Weekly herd review
- Confirm breeding cows, bulls, calves, sick animals, deaths, and culls.
- Review body condition, grazing pressure, water reliability, mineral access, and shade.
- Flag calving trouble, calf weakness, tick burden, coughing, and poor growth immediately.

2. Breeding-season management
- Assign each bull a clear improvement purpose and cow group.
- Review service records, returns, and bull soundness before the season gets away.
- Remove repeated problem breeders early instead of hoping feed alone will fix them.

3. Calf-survival priorities
- Prepare calving-watch routine, colostrum response, weak-calf support, and isolation plan before peak calving.
- Review every calf death for preventable management causes.
- Track mothering and calf vigor by cow line so weak genetics do not hide in herd averages.

4. Tick and disease pressure
- Treat tick load, water contamination, and respiratory/digestive issues as production threats.
- In humid zones, drainage and vector pressure deserve weekly attention.
- In dry zones, water stress and forage gaps drive the health picture.

5. Margin and scale rules
- Build sale groups by real weight and market class.
- Expand only after calving interval, calf survival, and feed security are stable.
- Convert every season into a measurable business review.`
  },
  {
   title: 'Download Cattle Breeding + Calving Calendar',
   filename: 'Cattle-Breeding-Calving-Calendar.txt',
   content: `Cattle University Professional
Breeding + Calving Calendar

Annual vaccination + parasite-control guide
- January-February: dry-season water/feed review, strategic deworming where needed, and breeder body-condition checks.
- March-April: pre-rain herd vaccination window, vector-control prep, calving area cleanup, and mineral restocking.
- May-August: wet-season tick, worm, and calf-disease watch; inspect calves weekly and record treatments.
- September-October: post-rain review, booster/risk-based vaccines where locally advised, and cull chronic poor performers.
- November-December: breeder readiness, pregnancy/calf-survival review, and next-season herd-health budgeting.

Recommended vaccine categories
- Core young-stock protection commonly includes clostridial products such as blackleg-type vaccines where locally used.
- Region-specific vaccines may include anthrax, lumpy skin disease, CBPP, or other official program vaccines depending on country.
- Breeding herd vaccines should be timed before breeding or calving windows so immunity is established before high-risk periods.
- Calf primary and booster doses should be tied to real handling dates such as branding or weaning so they are not missed.

Recommended parasite-control approach
- Combine internal deworming with tick and fly control instead of treating worm problems in isolation.
- Review benzimidazole, macrocyclic lactone, and levamisole-class products with your veterinarian based on farm efficacy history.
- Focus monitoring on calves, weaners, and heavily stocked wet-season groups.
- Weigh accurately and choose the correct route; pour-ons, injections, and drenches are not interchangeable by guesswork.

Pre-breeding
- Cow condition review
- Bull soundness checks
- Water and mineral planning

Breeding season
- Controlled bull assignments
- Service records
- Return-to-heat review

Pregnancy period
- Stage-based feeding
- Vaccination and parasite review
- Calving area prep

Calving phase
- Colostrum check
- Calf vigor and mothering notes
- Postpartum observation

Post-calving / grow-out
- Tick-control review
- Calf growth sampling
- Replacement vs sale decisions

Caution
- Final vaccine choice must match local disease risk, pregnancy status, product label, and withdrawal rules.`
  },
  {
   title: 'Download Cattle Herd Review Workbook',
   filename: 'Cattle-Herd-Review-Workbook.txt',
   content: `Cattle University Professional
Herd Review Workbook

1. Herd snapshot
- Breeding cows:
- Bulls active:
- Calves born:
- Calves weaned:
- Deaths / culls:

2. Fertility review
- Which groups conceived best?
- Which cows need removal?
- Is calving interval improving?

3. Health and resilience review
- Tick-pressure hotspots:
- Dry-season feed gap:
- Most expensive preventable loss:

4. Commercial review
- Sale class ready now:
- Average market weight:
- Buyer timing risk:
- One correction before herd expansion:`
  }
 ]
}

const professionalModuleDeepDives = {
 sheep: [
  { title: 'Breeding Objective Lock-In', cadence: 'Before mating season', checklist: ['Write the flock objective in one sentence: replacement females, market lambs, hardiness, or cross improvement.', 'Match ram groups to that objective instead of letting convenience decide the season.', 'Define the traits that cause automatic retention, observation, or culling before exposure begins.'], managerNotes: 'A disciplined sheep enterprise gets clearer every season; a casual one gets noisier.' },
  { title: 'Mating Window and Flock Setup', cadence: 'Weekly during breeding prep', checklist: ['Score ewe condition and flush only where body condition and feed support it.', 'Check ram feet, body condition, libido, and visible health before service.', 'Prepare one simple mating ledger that any supervisor can update accurately.'], managerNotes: 'Breeding control beats breeding excitement.' },
  { title: 'Pregnancy and Lambing Readiness', cadence: 'Trimester + pre-lambing', checklist: ['Adjust feed and handling pressure by pregnancy stage.', 'Prepare lambing pens, hygiene supplies, and weak-lamb tools before the first busy week.', 'Identify high-risk ewes and assign closer observation.'], managerNotes: 'Good lambing seasons look calm because the stress was handled before the births started.' },
  { title: 'Lamb Survival and Parasite Response', cadence: 'Daily during high-risk periods', checklist: ['Check colostrum success, lamb vigor, and dam mothering fast.', 'Treat parasite pressure, lamb weakness, and post-lambing maternal failure as same-day management issues.', 'Write down the likely cause for every preventable loss.'], managerNotes: 'Lamb survival is where breeding plans either become profit or excuses.' },
  { title: 'Market Grading and Scale Gate', cadence: 'End of cycle', checklist: ['Sort lambs by sale readiness instead of carrying weak animals in hope.', 'Compare buyers by reliability, payment speed, and complaint rate.', 'Expand only after fertility, survival, and feed security stay stable across seasons.'], managerNotes: 'A premium flock is built through repeated clean reviews, not one lucky batch.' }
 ],
 goat: [
  { title: 'Adapted Base Protection Plan', cadence: 'Before breeding decisions', checklist: ['Protect the adapted maternal base and avoid chasing frame at the cost of resilience.', 'Write the role of each buck line before mating begins.', 'Set one commercial priority per season: fertility, kid survival, frame, or terminal finish.'], managerNotes: 'The strongest goat systems know what not to dilute.' },
  { title: 'Buck Gate and Mating Control', cadence: 'Pre-breeding and weekly', checklist: ['Rank bucks for health, structure, libido, and target trait fit.', 'Keep mating groups controlled and recorded.', 'Remove bucks that are visually impressive but commercially unproven.'], managerNotes: 'Buck choice is a business decision wearing an animal face.' },
  { title: 'Kidding Readiness and Doe Support', cadence: 'Late pregnancy through kidding', checklist: ['Prep kidding pens, kid-warming tools, and colostrum backups.', 'Watch twin-heavy or weak does more closely.', 'Support doe recovery so the next breeding cycle is not quietly damaged.'], managerNotes: 'Kid survival improves when labor and preparation show up before the births.' },
  { title: 'Parasite and Respiratory Control SOP', cadence: 'Weekly with red-flag triggers', checklist: ['Check anemia signs, body condition, appetite, and coat thriftiness routinely.', 'Escalate respiratory spread, persistent coughing, or fast condition loss immediately.', 'Review browse pressure, shelter dryness, and pen hygiene alongside treatments.'], managerNotes: 'Parasites and respiratory disease punish sloppy systems first.' },
  { title: 'Market Batching and Margin Review', cadence: 'End of cycle', checklist: ['Grade kids and growers by weight class, thriftiness, and buyer fit.', 'Review margin per doe exposed, per kid weaned, and per batch sold.', 'Only scale after kidding survival and parasite control are repeatable.'], managerNotes: 'Good goat businesses scale the system, not just the headcount.' }
 ],
 cattle: [
  { title: 'Cow-Base and Herd Purpose Definition', cadence: 'Pre-season', checklist: ['Write the herd purpose clearly: replacement females, feeder calves, breeding stock, or terminal finish.', 'Keep adapted cows that prove fertility, mothering, and resilience under local conditions.', 'Cull sentimentality out of replacement decisions.'], managerNotes: 'A herd improves fastest when the cow base is chosen on performance instead of appearance.' },
  { title: 'Bull Assignment and Breeding Control', cadence: 'Pre-breeding and during service', checklist: ['Assign each bull one defined improvement job and cow group.', 'Track returns and weak-conception groups while the season is still recoverable.', 'Check feet, condition, behavior, and obvious health before and during service.'], managerNotes: 'Uncontrolled breeding creates expensive ambiguity.' },
  { title: 'Pregnancy and Calving Workflow', cadence: 'By stage', checklist: ['Adjust feed, minerals, and stress handling by pregnancy stage.', 'Prepare calving response tools, pens, and who-does-what instructions before due dates cluster.', 'Flag high-risk cows for closer observation.'], managerNotes: 'Calving pressure is easier to carry when the workflow is already written.' },
  { title: 'Calf Survival and Tick-Pressure Response', cadence: 'Daily in risk windows', checklist: ['Check calf vigor, suckling, and dam bonding quickly after birth.', 'Treat tick pressure, weak calves, and water-related stress as immediate production issues.', 'Write down preventable death causes and weak-line patterns.'], managerNotes: 'Calf survival is the real test of herd discipline.' },
  { title: 'Commercial Herd Review and Expansion Gate', cadence: 'Season close', checklist: ['Review conception, calf survival, weight gain, and margin together.', 'Compare dry-season preparedness against actual losses.', 'Scale only when fertility, survival, and feed-water resilience are stable.'], managerNotes: 'Big herds without review discipline are just bigger mistakes.' }
 ]
}

const professionalQaPrompts = {
 sheep: ['How do I tell if poor lamb growth is feed, parasite pressure, or weak mothering?', 'What should I review before replacing a ram that looks good but underperforms?', 'How do I know when a flock is ready to scale instead of just surviving?', 'What records should I show a lender or partner before expanding my sheep unit?'],
 goat: ['How do I separate parasite losses from feed shortage in a goat unit?', 'When should I keep WAD resilience instead of chasing bigger frame?', 'What should I check first when kid survival drops during a humid spell?', 'How do I know if my buck strategy is improving profit or just appearance?'],
 cattle: ['How do I know if poor calf growth is feed, water, tick pressure, or weak genetics?', 'What should I review first when calving interval stays too long?', 'How do I decide whether a bull is truly improving the herd?', 'What records should I show before expanding the herd or seeking financing?']
}

const professionalGuidancePlaybooks = {
 sheep: {
  parasite: { title: 'Parasite pressure reset', focus: 'Stabilize body condition and grazing pressure before the flock drifts into silent loss.', actions: ['Check body condition, coat thriftiness, appetite, and group-specific decline rather than waiting for obvious collapse.', 'Review grazing pressure, drainage, rotation discipline, and mineral support.', 'Separate weak or heavily affected animals and document what changed in the last two weeks.', 'Escalate fast if lambs are weakening or multiple groups are sliding together.'], escalate: 'Escalate when lamb thriftiness drops quickly, anemia signs show, or routine control is no longer holding.' },
  breeding: { title: 'Breeding performance review', focus: 'Treat poor conception or weak lamb crop as a system problem until proven otherwise.', actions: ['Check ram readiness, ewe condition, heat timing, and mating-group clarity.', 'Review whether the breeding objective was clear enough to guide selection.', 'Flag repeat offenders early and remove lines that keep draining progress.', 'Write one correction before the next exposure window.'], escalate: 'Escalate when multiple ewe groups return open or abortions, weakness, or fertility failure spread.' },
  market: { title: 'Sale-readiness plan', focus: 'Turn flock performance into cleaner sale classes and fewer slow-moving animals.', actions: ['Grade lambs by true market readiness, not age guesswork.', 'Track buyer timing, complaint rate, and payment speed.', 'Separate replacement candidates before sale pressure confuses the decision.', 'Do not carry weak lambs too long without a defined recovery margin.'], escalate: 'Escalate when buyers repeatedly discount animals for thriftiness, unevenness, or visible health weakness.' },
  general: { title: 'Operator guidance', focus: 'Use a simple sheep-farm root-cause sequence before making a big change.', actions: ['Describe the problem as fertility, survival, parasite, growth, or market issue.', 'Check feed, water, breeder quality, and records before changing multiple things.', 'Apply one correction, then re-measure quickly.', 'Keep the review clear enough for a supervisor or advisor to follow.'], escalate: 'Escalate when losses accelerate or the issue is no longer explainable by routine flock management.' }
 },
 goat: {
  parasite: { title: 'Goat parasite-control reset', focus: 'Protect kid growth and doe condition before worm pressure turns into a hidden margin leak.', actions: ['Check anemia signs, body condition, appetite, and coat quality by group.', 'Review browse pressure, rotation gaps, shelter dryness, and recent weather.', 'Separate weak animals and tighten observation immediately.', 'Document what changed before the decline started.'], escalate: 'Escalate when bottle jaw, severe weakness, rapid condition loss, or repeated kid decline appears.' },
  breeding: { title: 'Buck and doe strategy review', focus: 'Make sure the breeding system is improving the unit instead of just producing animals.', actions: ['Check whether each buck had a written improvement purpose.', 'Review conception pattern, kidding spread, and doe recovery.', 'Protect the adapted maternal base while reviewing frame and market goals.', 'Cull lines that repeatedly disappoint under your actual conditions.'], escalate: 'Escalate when kidding spread is poor, conception drops, or too many weak kids appear together.' },
  market: { title: 'Goat market-batch readiness', focus: 'Convert herd progress into sale groups that buyers trust.', actions: ['Grade animals by weight class, thriftiness, and buyer type.', 'Do not mix breeder-quality candidates with sale animals by accident.', 'Track margin per doe exposed and per kid weaned.', 'Use market feedback to improve buck choice, not just sale timing.'], escalate: 'Escalate when buyers repeatedly complain about unevenness, thriftiness, or respiratory signs.' },
  general: { title: 'Operator guidance', focus: 'Use a practical root-cause sequence and avoid random fixes.', actions: ['Describe the issue as parasite, respiratory, kidding, growth, or market problem.', 'Check browse, water, pen hygiene, and records first.', 'Make one correction, then review fast.', 'Write down what the unit should look like when the correction is working.'], escalate: 'Escalate when symptoms spread or the herd is sliding faster than routine management can explain.' }
 },
 cattle: {
  fertility: { title: 'Herd fertility reset', focus: 'Treat poor conception or long calving interval as a whole-system problem first.', actions: ['Check cow condition, bull soundness, water reliability, and breeding-group logic.', 'Review service records and returns while the season can still be corrected.', 'Identify whether the problem is one group or herd-wide.', 'Write a corrective action for the next 30 days.'], escalate: 'Escalate when open cows accumulate, abortions rise, or bull failure is suspected.' },
  calf: { title: 'Calf survival and growth response', focus: 'Stabilize calf vigor, dam support, and disease pressure before losses spread.', actions: ['Check colostrum success, dam behavior, calf appetite, and housing or paddock exposure.', 'Review tick burden, water quality, and recent weather or feed disruption.', 'Separate weak calves and increase observation frequency.', 'Record the likely trigger before treatment noise hides the sequence.'], escalate: 'Escalate when multiple calves weaken together or mortality starts rising.' },
  market: { title: 'Commercial herd readiness', focus: 'Move from owning animals to running saleable classes with measured timing.', actions: ['Group animals by true market class and weight readiness.', 'Review feed carry cost before holding for more size.', 'Compare buyers by timing, deductions, and payment reliability.', 'Keep replacement decisions separate from sale pressure.'], escalate: 'Escalate when dry-season carry cost, buyer discounting, or weak weights keep eroding margin.' },
  general: { title: 'Operator guidance', focus: 'Use a business-first troubleshooting sequence.', actions: ['Define the issue as fertility, calf survival, feed-water resilience, tick pressure, or market problem.', 'Check body condition, water, records, and pressure points before changing many variables.', 'Make one correction and assign an owner.', 'Re-measure against one biological KPI and one financial KPI.'], escalate: 'Escalate when herd decline continues or the cause cannot be separated by routine review.' }
 }
}

const getProfessionalGuidancePlaybook = (product, question='') => {
 const q = String(question || '').toLowerCase()
 const guideSet = professionalGuidancePlaybooks[product] || {}
 let key = 'general'
 if (product === 'sheep') key = q.includes('parasite') || q.includes('worm') || q.includes('weak') ? 'parasite' : (q.includes('breed') || q.includes('ram') || q.includes('conception')) ? 'breeding' : (q.includes('market') || q.includes('sell') || q.includes('buyer')) ? 'market' : 'general'
 else if (product === 'goat') key = q.includes('parasite') || q.includes('worm') || q.includes('haemonchus') ? 'parasite' : (q.includes('buck') || q.includes('breed') || q.includes('kidding')) ? 'breeding' : (q.includes('market') || q.includes('sell') || q.includes('buyer')) ? 'market' : 'general'
 else if (product === 'cattle') key = q.includes('fertility') || q.includes('open cow') || q.includes('calving interval') || q.includes('breed') ? 'fertility' : (q.includes('calf') || q.includes('tick') || q.includes('growth')) ? 'calf' : (q.includes('market') || q.includes('sell') || q.includes('buyer') || q.includes('weight')) ? 'market' : 'general'
 return guideSet[key] || guideSet.general || { title: 'Operator guidance', focus: 'Use a simple structured review.', actions: ['Describe the issue clearly.', 'Check records and operating conditions.', 'Make one correction and re-measure.'], escalate: 'Escalate when losses accelerate.' }
}

function UniversityExecutiveToolkit({ product, progress, setProgress, trackKey, openModule, question, setQuestion, answer, setAnswer }) {
 const downloads = professionalDownloads[product] || []
 const deepDives = professionalModuleDeepDives[product] || []
 const prompts = professionalQaPrompts[product] || []
 const activeDive = deepDives[Math.max(0, openModule)] || deepDives[0]
 const moduleName = product === 'sheep' ? sheepTracks[trackKey]?.modules?.[openModule]?.name : product === 'goat' ? goatTracks[trackKey]?.modules?.[openModule]?.name : cattleTracks[trackKey]?.modules?.[openModule]?.name
 return <article className='panel poultry-pro-shell' style={{marginTop:10, border: product === 'sheep' ? '1.5px solid #7c3aed' : product === 'goat' ? '1.5px solid #0d9488' : '1.5px solid #d97706', background: product === 'sheep' ? '#faf5ff' : product === 'goat' ? '#ecfeff' : '#fff7ed'}}>
  <h4 style={{marginTop:0}}>🏆 Executive Tools</h4>
  <div className='list'>
   <div className='list-row'><span>Open professional module</span><strong>{moduleName || 'Open a module to load its pro checklist'}</strong></div>
   <div className='list-row'><span>Deep-dive execution notes</span><strong>{deepDives.length} operating packs</strong></div>
   <div className='list-row'><span>Downloadable playbooks and workbooks</span><strong>{downloads.length} files</strong></div>
   <div className='list-row'><span>Guided expert prompts</span><strong>{prompts.length} prompts ready</strong></div>
   <div className='list-row'><span>Progress tracking dashboard</span><strong>{(progress.completed || []).length} checkpoints logged</strong></div>
  </div>
  <div className='helper-text' style={{marginTop:4}}>This area is built to feel complete when opened: operating playbooks, downloadable packs, guided troubleshooting, and module-by-module execution notes.</div>
  {activeDive && <div className='panel' style={{marginTop:10, background:'#fff'}}>
   <div className='list-row'><span>Current deep dive</span><strong>{activeDive.title}</strong></div>
   <div className='helper-text'>Cadence: {activeDive.cadence}</div>
   <div className='list' style={{marginTop:8}}>{activeDive.checklist.map((item)=><div key={item} className='list-row'><span>{item}</span></div>)}</div>
   <div className='helper-text' style={{marginTop:8}}>{activeDive.managerNotes}</div>
  </div>}
  <div className='inlineForm' style={{marginTop:8, flexWrap:'wrap'}}>
   {downloads.map((asset)=><a key={asset.filename} className='poultry-tool-card' download={asset.filename} href={'data:text/plain;charset=utf-8,'+encodeURIComponent(asset.content)}><strong>{asset.title}</strong><span>{asset.filename}</span></a>)}
  </div>
  <div className='inlineForm' style={{marginTop:8, flexWrap:'wrap'}}>
   {prompts.map((prompt)=><button key={prompt} className={`poultry-tool-card ${question===prompt ? 'active' : ''}`} onClick={()=>setQuestion(prompt)}><strong>Use prompt</strong><span>{prompt}</span></button>)}
  </div>
  <div className='panel' style={{marginTop:10, background:'#fff'}}>
   <div className='helper-text' style={{marginBottom:6}}>Guided troubleshooting / strategy builder</div>
   <input className='input' placeholder='Describe the issue or decision you want to work through' value={question} onChange={(e)=>setQuestion(e.target.value)} />
   <div className='inlineForm' style={{marginTop:8, flexWrap:'wrap'}}>
    <button className='btn btn-dark' onClick={()=>setAnswer(JSON.stringify(getProfessionalGuidancePlaybook(product, question)))}>Generate guidance</button>
    <button className='btn' disabled={openModule < 0} onClick={()=>{
      if (openModule < 0) return
      const checkpoint = `${trackKey}:${openModule}`
      setProgress((s)=>({ ...s, completed: Array.from(new Set([...(s.completed||[]), checkpoint])) }))
    }}>Mark Current Module Complete</button>
   </div>
   {!!answer && (() => {
    const guide = JSON.parse(answer)
    return <div className='panel' style={{marginTop:10, background:'#f8fafc'}}>
     <h5 style={{marginTop:0, marginBottom:6}}>{guide.title}</h5>
     <div className='helper-text' style={{marginBottom:8}}>{guide.focus}</div>
     <div className='list'>{(guide.actions || []).map((item)=><div key={item} className='list-row'><span>{item}</span></div>)}</div>
     <div className='helper-text' style={{marginTop:8}}><strong>Escalate:</strong> {guide.escalate}</div>
    </div>
   })()}
  </div>
 </article>
}

function ProfessionalAssets({ product, progress, setProgress, trackKey, openModule }) {
 const completed = (progress?.completed || []).length
 return <>
 <article className='panel' style={{marginTop:10, border:'1.5px solid #334155', background:'#f8fafc'}}>
 <h4 style={{marginTop:0}}>🏛️ Operating Brief</h4>
 <div className='helper-text' style={{marginBottom:8}}>A concise operating brief for teams, partners, and program stakeholders.</div>
 <div className='inlineForm' style={{flexWrap:'wrap'}}>
 <a className='btn' download={`${product}-Executive-Brief.txt`} href={'data:text/plain;charset=utf-8,' + encodeURIComponent(executiveBriefs[product] || '')}>Download Operating Brief</a>
 <button className='btn' type='button' onClick={() => setProgress((s) => ({ ...s, completed: Array.from(new Set([...(s.completed || []), `${trackKey}:${openModule}`, `${product}:brief`])) }))}>Mark Brief Reviewed</button>
 </div>
 </article>
 <article className='panel' style={{marginTop:12, background:'linear-gradient(180deg,#ffffff 0%,#f8fafc 100%)'}}>
 <h4 style={{marginTop:0}}>📊 Professional Benchmark Scorecard</h4>
 <div className='list'>
 {(professionalOutcomeBenchmarks[product] || []).map((item) => <div className='list-row' key={item}><span>{item}</span><strong>Track weekly</strong></div>)}
 </div>
 </article>
 <article className='panel' style={{marginTop:10}}>
 <h4 style={{marginTop:0}}>✅ Module Outcome Summary</h4>
 <div className='list'>
 {(productModuleOutcomeSummaries[product] || productModuleOutcomeSummaries.poultry).map((item, idx) => <div className='list-row' key={`${product}-outcome-${idx}`}><span>{`Module ${idx + 1} outcome`}</span><strong>{item}</strong></div>)}
 </div>
 </article>
 {completed >= 3 && <article className='panel' style={{marginTop:10, border:'2px solid #0f766e', background:'#ecfdf5'}}>
 <h4 style={{marginTop:0}}>🧾 Professional Report Card</h4>
 <p>This learner has completed multiple professional checkpoints and can export a review-ready completion record.</p>
 <button className='btn btn-dark' type='button' onClick={() => window.print()}>Print Report Card / Certificate</button>
 </article>}
 </>
}

const universityPlanPreview = {
 free: {
 title: 'Free',
 features: ['Module 1 access', 'Breed cards / KPI preview', 'Free tier overview before paying']
 },
 basic: {
 title: 'Basic',
 features: ['All 5 modules unlocked', 'Climate/zone guidance', 'Health schedule access', 'Structured learning path']
 },
 pro: {
 title: 'Professional',
 features: ['Everything in Basic', 'Operating briefs, scorecards, and printable templates', 'Progress tracking dashboard', 'Certificate/report path where supported']
 }
}

// Locked by user request: High Demand Products/Services must always display 10 rows unless explicitly changed.
const DEMAND_LOCK_COUNT = 10
const lockDemandCount = (arr, fillerFactory) => {
 const out = [...arr]
 while (out.length < DEMAND_LOCK_COUNT) out.push(fillerFactory(out.length + 1))
 return out.slice(0, DEMAND_LOCK_COUNT)
}

const isUserImage = (v) => String(v || '').startsWith('data:image/')


const MAX_IMAGE_COUNTS = { products: 20, livestock: 10, services: 20 }
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

const parseImageList = (value) => {
 if (Array.isArray(value)) return value.filter(Boolean)
 if (!value) return []
 try {
 const parsed = JSON.parse(value)
 return Array.isArray(parsed) ? parsed.filter(Boolean) : []
 } catch {
 return []
 }
}

const normalizeListingImages = (images = [], coverImageUrl = '') => {
 const list = parseImageList(images)
 const cover = coverImageUrl || list[0] || ''
 return { image_urls: JSON.stringify(list), cover_image_url: cover }
}

function ListingImagePicker({ label, limit, images, setImages }) {
 const onFiles = async (e) => {
 const files = Array.from(e.target.files || [])
 if (!files.length) return
 if (images.length + files.length > limit) {
 alert(`You can upload up to ${limit} images here.`)
 e.target.value = ''
 return
 }
 const next = []
 for (const file of files) {
 if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
 alert(`${file.name} must be JPG, PNG, or WebP.`)
 continue
 }
 if (file.size > MAX_IMAGE_BYTES) {
 alert(`${file.name} is larger than 5MB.`)
 continue
 }
 try {
 const dataUrl = await compressImageFileToDataUrl(file)
 next.push(dataUrl)
 } catch (err) {
 alert(err?.message || 'Could not process image.')
 }
 }
 if (next.length) setImages(prev => [...prev, ...next].slice(0, limit))
 e.target.value = ''
 }

 return <div className='panel image-picker'>
 <div className='list-row'>
 <strong>{label}</strong>
 <span>{images.length}/{limit} images</span>
 </div>
 <input className='input' type='file' accept='image/jpeg,image/png,image/webp' multiple onChange={onFiles} />
 {!!images.length && <div className='image-grid'>
 {images.map((src, idx) => <div className='image-thumb-wrap' key={`${label}-${idx}`}>
 <img src={src} alt={`${label} ${idx + 1}`} className='image-thumb' />
 <div className='image-thumb-actions'>
 <button type='button' className='btn btn-mini' onClick={() => setImages(prev => prev.map((img, i) => i === idx && idx > 0 ? prev[idx - 1] : img).map((img, i) => i === idx - 1 ? prev[idx] : img))} disabled={idx === 0}>↑</button>
 <button type='button' className='btn btn-mini' onClick={() => setImages(prev => prev.filter((_, i) => i !== idx))}>Remove</button>
 {idx !== 0 && <button type='button' className='btn btn-mini' onClick={() => setImages(prev => [prev[idx], ...prev.filter((_, i) => i !== idx)])}>Set cover</button>}
 {idx === 0 && <span className='cover-badge'>Cover</span>}
 </div>
 </div>)}
 </div>}
 <div className='helper-text'>JPG, PNG, or WebP only. Max 5MB each. First image is the cover.</div>
 </div>
}

function EmptyListingsState({ title, body, actionLabel, onAction }) {
 return <div className='empty-state panel'>
 <div className='empty-emoji'>📭</div>
 <h4>{title}</h4>
 <p>{body}</p>
 {onAction && <button type='button' className='btn btn-dark' onClick={onAction}>{actionLabel}</button>}
 </div>
}

function ListingGallery({ images = [], title = 'Listing images', onOpen }) {
 const [index, setIndex] = useState(0)
 const list = parseImageList(images)
 useEffect(() => { if (index >= list.length) setIndex(0) }, [list.length, index])
 if (!list.length) return <div className='listing-cover placeholder'>No photo yet</div>
 return <div className='gallery'>
 <img src={list[index]} alt={`${title} ${index + 1}`} className='listing-cover' onClick={() => onOpen && onOpen(list, index, title)} />
 {list.length > 1 && <>
 <div className='gallery-controls'>
 <button type='button' className='btn btn-mini' onClick={() => setIndex((index - 1 + list.length) % list.length)}>‹</button>
 <span className='gallery-count'>{index + 1}/{list.length}</span>
 <button type='button' className='btn btn-mini' onClick={() => setIndex((index + 1) % list.length)}>›</button>
 </div>
 <div className='gallery-dots'>
 {list.map((_, i) => <button key={`${title}-dot-${i}`} type='button' className={`gallery-dot ${i === index ? 'active' : ''}`} onClick={() => setIndex(i)} />)}
 </div>
 </>}
 </div>
}

function ListingDetailCard({ title, subtitle, stats = [], contact = '', children }) {
 return <article className='panel detail-card'>
 <div className='detail-meta'>
 <h4>{title}</h4>
 <div className='helper-text'>{subtitle}</div>
 {!!stats.length && <div className='listing-card-metrics'>{stats.map((item) => <span key={item}>{item}</span>)}</div>}
 {!!contact && <div className='contact-panel'>Seller/contact: {contact}</div>}
 </div>
 {children}
 </article>
}

const listingKey = (kind, id) => `${kind}:${id}`
const isSavedListing = (saved, kind, id) => saved.includes(listingKey(kind, id))

const openOrderFromListing = ({ me, setActive, setOrderForm, listingType, listingId, listingTitle, sellerId, unitPrice, quantity = 1 }) => {
 setOrderForm(prev => ({
 ...prev,
 buyer_id: Number(me?.id || prev.buyer_id || 1),
 seller_id: Number(sellerId || prev.seller_id || 2),
 listing_type: listingType,
 listing_id: Number(listingId || 1),
 listing_title: listingTitle || '',
 quantity: Number(quantity || 1),
 unit_price: Number(unitPrice || 0),
 }))
 setActive('payments')
}

function DataTable({ columns, rows, filterKey, onEdit, onRowClick }) {
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
 <tr key={r.id || i} onClick={() => onRowClick && onRowClick(r)} style={onRowClick ? { cursor: 'pointer' } : undefined}>
 {columns.map(c => <td key={c}>{String(r[c] ?? '')}</td>)}
 {onEdit && <td><button className='btn btn-dark' onClick={(e) => { e.stopPropagation(); onEdit(r) }}>Edit</button></td>}
 </tr>
 ))}
 {!filtered.length && <tr><td colSpan={columns.length + (onEdit ? 1 : 0)}>No records</td></tr>}
 </tbody>
 </table>
 </div>
}


function AppInner() {
 const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams('')
 const resumeSection = (typeof window !== 'undefined' ? (localStorage.getItem('farmsavior_resume_section') || '') : '')
 const forcePublicView = (searchParams.get('public') !== '0') && !resumeSection
 const authPrompt = searchParams.get('auth') || ''
 const initialCommunityProfileUserId = searchParams.get('communityProfile') || ''
 const explicitGo = searchParams.get('go') || ''
 const mappedGo = (explicitGo === 'poultry-academy' ? 'poultry-university' : (explicitGo === 'sheep-academy' ? 'sheep-university' : (explicitGo === 'goat-academy' ? 'goat-university' : (explicitGo === 'cattle-academy' ? 'cattle-university' : explicitGo))))
 const stickySections = new Set(['payments','livestock-records','poultry-university','sheep-university','goat-university','cattle-university','community','world-chat','ai-disease'])
 const initialSection = (mappedGo && mappedGo !== 'onboarding' ? mappedGo : (stickySections.has(resumeSection) ? resumeSection : 'home'))
 const [token, setToken] = useState(localStorage.getItem('farmsavior_token'))
 const [authMode, setAuthMode] = useState('login')
 const [portalType, setPortalType] = useState('main')
 const [uiCountry, setUiCountry] = useState(() => localStorage.getItem('farmsavior_ui_country') || 'GH')
 const [uiLang, setUiLang] = useState(() => localStorage.getItem('farmsavior_ui_lang') || 'en')
 const [phoneForOtp, setPhoneForOtp] = useState('')
 const [authMsg, setAuthMsg] = useState('')
 const [authLoading, setAuthLoading] = useState(false)
 const [communitySubmitting, setCommunitySubmitting] = useState(false)
 const [showAuthModal, setShowAuthModal] = useState(false)
 const [pendingFeatureLabel, setPendingFeatureLabel] = useState('')
 const [pendingFeatureSection, setPendingFeatureSection] = useState('')
 const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
 const [active, setActive] = useState(initialSection)
 const [productsView, setProductsView] = useState('list')
 const [livestockView, setLivestockView] = useState('list')
 const [servicesView, setServicesView] = useState('list')
 const [lightbox, setLightbox] = useState({ open: false, images: [], index: 0, title: '' })
 const [savedListings, setSavedListings] = useState(() => { try { return JSON.parse(localStorage.getItem('farmsavior_saved_listings') || '[]') } catch { return [] } })
 useEffect(() => {
  try {
   const stickySections = new Set(['payments','livestock-records','poultry-university','sheep-university','goat-university','cattle-university','community','world-chat','ai-disease'])
   if (stickySections.has(active)) localStorage.setItem('farmsavior_resume_section', active)
   else if (active === 'home' || active === 'onboarding') localStorage.removeItem('farmsavior_resume_section')
  } catch {}
 }, [active])
 const [publicDetail, setPublicDetail] = useState(null)
 const [homeQuery, setHomeQuery] = useState('')
 const [publicQuery, setPublicQuery] = useState('')
 const [recentSearches, setRecentSearches] = useState([])
 const [recentViewed, setRecentViewed] = useState([])
 const [worldChat, setWorldChat] = useState([])
 const [worldChatText, setWorldChatText] = useState('')
 const [worldChatMsg, setWorldChatMsg] = useState('')
 const [worldChatQueue, setWorldChatQueue] = useState([])

 const [communityProfile, setCommunityProfile] = useState(() => {
 try {
 const raw = localStorage.getItem('farmsavior_community_profile_cache')
 return raw ? JSON.parse(raw) : { full_name: '', username: '', avatar_url: '', cover_image_url: '', bio: '', farm_life: '', interests: 'farming,gardening', visibility: 'PUBLIC' }
 } catch {
 return { full_name: '', username: '', avatar_url: '', cover_image_url: '', bio: '', farm_life: '', interests: 'farming,gardening', visibility: 'PUBLIC' }
 }
 })
 const [communityProfileBaseline, setCommunityProfileBaseline] = useState(null)
 const [communityProfileDirty, setCommunityProfileDirty] = useState(false)
 const [communityProfileSaving, setCommunityProfileSaving] = useState(false)
 const [communityProfileEditorOpen, setCommunityProfileEditorOpen] = useState(false)
 const [communityProfileSectionsOpen, setCommunityProfileSectionsOpen] = useState({ photos: true, identity: true, story: false, privacy: false })
 const [communityPosts, setCommunityPosts] = useState([])
 const [communityFeedMode, setCommunityFeedMode] = useState('for-you')
 const [communityFeedItems, setCommunityFeedItems] = useState([])
 const [communityUserSearch, setCommunityUserSearch] = useState('')
 const [communityUserResults, setCommunityUserResults] = useState([])
 const [communityFollowBusyUserId, setCommunityFollowBusyUserId] = useState(null)
 const [communityLikeBusyPostIds, setCommunityLikeBusyPostIds] = useState({})
 const [communityFollowState, setCommunityFollowState] = useState({ following_ids: [], following_count: 0, followers_count: 0, following: [], muted_ids: [], muted_count: 0 })
 const [communityPostForm, setCommunityPostForm] = useState({ text: '', media_url: '', media_type: 'TEXT', tags: '' })
 const [communityMessageThreads, setCommunityMessageThreads] = useState([])
 const [communityInboxOpen, setCommunityInboxOpen] = useState(false)
 const [communityMessageView, setCommunityMessageView] = useState({ open: false, loading: false, error: '', user: null, messages: [] })
 const [communityMessageDraft, setCommunityMessageDraft] = useState('')
 const [communityMessageSending, setCommunityMessageSending] = useState(false)
 const [communityMessageOpeningUserId, setCommunityMessageOpeningUserId] = useState(null)
 const [communityCallPermissionBusy, setCommunityCallPermissionBusy] = useState(false)
 const [communityIncomingCall, setCommunityIncomingCall] = useState(null)
 const [communityActiveCall, setCommunityActiveCall] = useState(null)
 const communityMessageListRef = useRef(null)
 const communityLastCallAlertRef = useRef(null)
 const [editingCommunityPostId, setEditingCommunityPostId] = useState(null)
 const [communityCommentText, setCommunityCommentText] = useState({})
 const [communityComments, setCommunityComments] = useState({})
 const [communityProfileView, setCommunityProfileView] = useState({ open: !!initialCommunityProfileUserId, loading: false, data: null, error: '', userId: initialCommunityProfileUserId || null })
 const [communityProfileOpeningUserId, setCommunityProfileOpeningUserId] = useState(null)

 useEffect(() => {
 try { localStorage.setItem('farmsavior_community_profile_cache', JSON.stringify(communityProfile || {})) } catch {}
 }, [communityProfile])

 const isFollowingUser = (userId) => (communityFollowState?.following_ids || []).map(String).includes(String(userId))
 const isMutedUser = (userId) => (communityFollowState?.muted_ids || []).map(String).includes(String(userId))
 const isCommunityLikeBusy = (postId) => !!communityLikeBusyPostIds?.[postId]
 const syncCommunityProfileRoute = (userId, mode = 'push') => {
 try {
 const url = new URL(window.location.href)
 url.searchParams.set('go', 'community')
 if (userId) url.searchParams.set('communityProfile', String(userId))
 else url.searchParams.delete('communityProfile')
 if (mode === 'replace') window.history.replaceState({}, '', url.toString())
 else window.history.pushState({}, '', url.toString())
 } catch {}
 }
 const syncCommunityUserFollow = (userId, following, followersCount = null) => {
 setCommunityUserResults(prev => (prev || []).map(user => String(user.user_id) === String(userId)
 ? { ...user, is_following: following, followers_count: followersCount ?? user.followers_count }
 : user
 ))
 setCommunityFeedItems(prev => (prev || []).map(item => item?.actor?.user_id === userId
 ? { ...item, actor: { ...(item.actor || {}), is_following: following, followers_count: followersCount ?? item?.actor?.followers_count } }
 : item
 ))
 }
 const openCommunityProfileView = async (userId, options = {}) => {
 if (!userId) return
 const { skipHistory = false, historyMode = 'push' } = options
 setActive('community')
 if (!skipHistory) syncCommunityProfileRoute(userId, historyMode)
 setCommunityProfileOpeningUserId(userId)
 setCommunityProfileView({ open: true, loading: true, data: null, error: '', userId })
 try {
 const data = await api.fetchCommunityUserProfile(userId, 24)
 setCommunityProfileView({ open: true, loading: false, data: data || null, error: '', userId })
 window.scrollTo({ top: 0, behavior: 'smooth' })
 } catch (err) {
 setCommunityProfileView({ open: true, loading: false, data: null, error: errMsg(err), userId })
 } finally {
 setCommunityProfileOpeningUserId(null)
 }
 }

 const closeCommunityProfileView = (options = {}) => {
 const { skipHistory = false } = options
 setCommunityProfileOpeningUserId(null)
 if (!skipHistory) {
  try {
   const url = new URL(window.location.href)
   if (url.searchParams.get('communityProfile')) {
    window.history.back()
    return
   }
  } catch {}
  syncCommunityProfileRoute('', 'replace')
 }
 setCommunityProfileView({ open: false, loading: false, data: null, error: '', userId: null })
 window.scrollTo({ top: 0, behavior: 'smooth' })
 }
 const openCommunityInbox = async () => {
 setCommunityInboxOpen(true)
 setCommunityMessageView({ open: false, loading: false, error: '', user: null, messages: [] })
 const threads = await api.fetchCommunityMessageThreads().catch(() => communityMessageThreads || [])
 setCommunityMessageThreads(threads || [])
 return threads || []
 }
 const openCommunityMessages = async (user) => {
 const targetUserId = user?.user_id || user?.id
 if (!targetUserId) return
 const normalizedUser = { ...(user || {}), user_id: targetUserId }
 setCommunityInboxOpen(true)
 setCommunityMessageOpeningUserId(targetUserId)
 setCommunityMessageView({ open: true, loading: true, error: '', user: normalizedUser, messages: [] })
 try {
  const data = await api.fetchCommunityMessageThread(targetUserId, 80)
  setCommunityMessageView({ open: true, loading: false, error: '', user: data?.user || normalizedUser, messages: data?.messages || [] })
 } catch (err) {
  setCommunityMessageView({ open: true, loading: false, error: errMsg(err), user: normalizedUser, messages: [] })
 } finally {
  setCommunityMessageOpeningUserId(null)
 }
 }
 const closeCommunityMessages = () => {
 setCommunityInboxOpen(false)
 setCommunityMessageView({ open: false, loading: false, error: '', user: null, messages: [] })
 setCommunityMessageDraft('')
 setCommunityMessageSending(false)
 setCommunityMessageOpeningUserId(null)
 }
 const sendActiveCommunityMessage = async () => {
  const targetUserId = communityMessageView?.user?.user_id
  const textValue = String(communityMessageDraft || '').trim()
  if (!targetUserId || !textValue || communityMessageSending) return
  try {
   setCommunityMessageSending(true)
   const sent = await api.sendCommunityMessage(targetUserId, { text: textValue })
   setCommunityMessageDraft('')
   setCommunityMessageView(prev => ({ ...prev, messages: [ ...(prev?.messages || []), sent ].filter(Boolean) }))
   const threads = await api.fetchCommunityMessageThreads().catch(() => [])
   setCommunityMessageThreads(threads || [])
  } catch (err) {
   alert(errMsg(err))
  } finally {
   setCommunityMessageSending(false)
  }
 }
 const sendCommunityCallInvite = async (mode = 'audio') => {
  const targetUserId = communityMessageView?.user?.user_id
  if (!targetUserId || communityMessageSending) return
  const meId = String(me?.id || '')
  const otherId = String(targetUserId || '')
  const pairSeed = [meId, otherId].filter(Boolean).sort().join('-') || 'pair'
  const room = `farmsavior-${pairSeed}-${Date.now()}`
  const callUrl = mode === 'video'
   ? `https://meet.jit.si/${room}#config.prejoinConfig.enabled=false&config.prejoinPageEnabled=false&config.requireDisplayName=false&config.disableDeepLinking=true`
   : `https://meet.jit.si/${room}#config.startWithVideoMuted=true&config.prejoinConfig.enabled=false&config.prejoinPageEnabled=false&config.requireDisplayName=false&config.disableDeepLinking=true`
  const inviteText = `${mode === 'video' ? '📹' : '📞'} Join my ${mode} call: ${callUrl}`
  try {
   setCommunityMessageSending(true)
   const sent = await api.sendCommunityMessage(targetUserId, { text: inviteText })
   setCommunityMessageView(prev => ({ ...prev, messages: [ ...(prev?.messages || []), sent ].filter(Boolean) }))
   const threads = await api.fetchCommunityMessageThreads().catch(() => [])
   setCommunityMessageThreads(threads || [])
   setCommunityActiveCall({ url: callUrl, mode })
  } catch (err) {
   alert(errMsg(err))
  } finally {
   setCommunityMessageSending(false)
  }
 }
 const enableCommunityCallPermissions = async (options = {}) => {
  const { silent = false } = options
  if (communityCallPermissionBusy) return
  try {
   setCommunityCallPermissionBusy(true)
   if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'granted') {
    await Notification.requestPermission()
   }
   if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
    ;(stream.getTracks?.() || []).forEach(track => track.stop())
   }
   try { if (typeof window !== 'undefined' && 'localStorage' in window) localStorage.setItem('farmsavior_call_permissions_granted', '1') } catch {}
  } catch (err) {
   if (!silent) alert(errMsg(err))
  } finally {
   setCommunityCallPermissionBusy(false)
  }
 }
 useEffect(() => {
  if (!communityInboxOpen || !communityMessageView.open) return
  const node = communityMessageListRef.current
  if (!node) return
  node.scrollTop = node.scrollHeight
 }, [communityInboxOpen, communityMessageView.open, communityMessageView.messages, communityMessageView.loading])
 useEffect(() => {
  if (!communityInboxOpen) return
  let alreadyGranted = false
  try { if (typeof window !== 'undefined' && 'localStorage' in window) alreadyGranted = localStorage.getItem('farmsavior_call_permissions_granted') === '1' } catch {}
  const notificationsGranted = (typeof window !== 'undefined' && 'Notification' in window) ? Notification.permission === 'granted' : false
  if (alreadyGranted && notificationsGranted) return
  enableCommunityCallPermissions({ silent: true })
 }, [communityInboxOpen])
 useEffect(() => {
  if (!communityMessageView.open || communityMessageView.loading) return
  const latest = (communityMessageView.messages || []).slice(-1)[0]
  if (!latest || latest.is_mine) return
  const text = String(latest.text || '')
  const lowerText = text.toLowerCase()
  const looksLikeCallInvite = lowerText.includes('join my audio call:') || lowerText.includes('join my video call:') || lowerText.includes('meet.jit.si/')
  if (!looksLikeCallInvite) return
  const marker = String(latest.id || latest.created_at || lowerText)
  if (communityLastCallAlertRef.current === marker) return
  const createdMs = latest?.created_at ? new Date(latest.created_at).getTime() : Date.now()
  if (!Number.isFinite(createdMs) || (Date.now() - createdMs) > 90 * 1000) return
  communityLastCallAlertRef.current = marker
  const callUrl = (text.match(/https?:\/\/meet\.jit\.si\/[^\s]+/i) || [])[0] || ''
  const mode = lowerText.includes('video') ? 'video' : 'audio'
  const sender = communityMessageView?.user?.full_name || 'A user'
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
   try { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]) } catch {}
   setCommunityIncomingCall({ from: sender, mode, url: callUrl })
   return
  }
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
   new Notification('Incoming FarmSavior call invite', { body: `${sender} is calling you (${mode}). Open Community messages to answer.`, silent: false })
  }
 }, [communityMessageView.open, communityMessageView.loading, communityMessageView.messages, communityMessageView?.user?.full_name])
 useEffect(() => {
 if (active !== 'community') return
 const routeUserId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('communityProfile') : ''
 if (routeUserId) {
  if (String(communityProfileView.userId || '') !== String(routeUserId) || !communityProfileView.open) openCommunityProfileView(routeUserId, { skipHistory: true })
 } else if (communityProfileView.open) {
  setCommunityProfileOpeningUserId(null)
  setCommunityProfileView({ open: false, loading: false, data: null, error: '', userId: null })
 }
 }, [active])

 useEffect(() => {
 const handlePopState = () => {
  try {
   const params = new URLSearchParams(window.location.search)
   const routeUserId = params.get('communityProfile') || ''
   const routeSection = params.get('go') || 'home'
   if (routeSection !== 'community') return
   setActive('community')
   if (routeUserId) openCommunityProfileView(routeUserId, { skipHistory: true })
   else closeCommunityProfileView({ skipHistory: true })
  } catch {}
 }
 window.addEventListener('popstate', handlePopState)
 return () => window.removeEventListener('popstate', handlePopState)
 }, [])

 const viewedCommunityProfile = communityProfileView.data?.profile || null
 const viewedCommunityPosts = communityProfileView.data?.posts || []
 const viewedCommunityViewer = communityProfileView.data?.viewer || {}
 const communityProfileHeadline = (profile) => profile?.bio || profile?.farm_life || (profile?.interests ? `Interested in ${profile.interests}.` : 'This grower has not added a profile story yet.')

 const syncCommunityUserMute = (userId, muted) => {
 setCommunityUserResults(prev => (prev || []).map(user => String(user.user_id) === String(userId)
 ? { ...user, is_muted: muted }
 : user
 ))
 setCommunityFeedItems(prev => muted
 ? (prev || []).filter(item => String(item?.actor?.user_id || item?.post?.user_id || '') !== String(userId))
 : (prev || []).map(item => item?.actor?.user_id === userId
 ? { ...item, actor: { ...(item.actor || {}), is_muted: false } }
 : item
 ))
 setCommunityPosts(prev => muted
 ? (prev || []).filter(post => String(post?.user_id || '') !== String(userId))
 : prev
 )
 }
 const toggleFollowUser = async (userId) => {
 if (!userId || communityFollowBusyUserId === userId) return
 setCommunityFollowBusyUserId(userId)
 try {
 const result = await api.toggleCommunityFollow(userId)
 const following = !!result?.following
 const followersCount = Number(result?.followers_count ?? 0)
 setCommunityFollowState(prev => {
 const ids = new Set((prev?.following_ids || []).map(String))
 if (following) ids.add(String(userId))
 else ids.delete(String(userId))
 return {
 ...prev,
 following_ids: Array.from(ids).map(Number).filter(Number.isFinite),
 following_count: Number(result?.following_count ?? ids.size),
 followers_count: prev?.followers_count ?? 0,
 following: following
 ? [ ...(prev?.following || []), ...(communityUserResults.filter(user => String(user.user_id) === String(userId))) ].filter((user, idx, arr) => user && arr.findIndex(x => String(x?.user_id) === String(user?.user_id)) === idx)
 : (prev?.following || []).filter(user => String(user?.user_id) !== String(userId))
 }
 })
 syncCommunityUserFollow(userId, following, followersCount)
 await loadCommunity()
 } catch (err) {
 alert(errMsg(err))
 } finally {
 setCommunityFollowBusyUserId(null)
 }
 }
 const toggleMuteUser = async (userId) => {
 try {
 const result = await api.toggleCommunityMute(userId)
 const muted = !!result?.muted
 const mutedIds = (result?.muted_ids || []).map(Number).filter(Number.isFinite)
 setCommunityFollowState(prev => ({
 ...prev,
 muted_ids: mutedIds,
 muted_count: Number(result?.muted_count ?? mutedIds.length),
 }))
 syncCommunityUserMute(userId, muted)
 await loadCommunity()
 } catch (err) {
 alert(errMsg(err))
 }
 }

 const [state, setState] = useState({ metrics: {}, users: [], listings: [], livestock: [], livestockRecords: [], livestockPurchaseSources: [], logistics: [], equipment: [], storage: [], payments: [], orders: [], payoutProfiles: [], notifications: [], payoutHistory: [], alerts: [], contracts: [], idv: [], passports: [], verificationApps: [], approvedAccounts: [], deviceTokens: [], diseaseScans: [], disputes: [], fraudFlags: [], news: [], publicWeather: [], govPrograms: [], spotTrading: [], spotHistory: [], tradeExportStats: [], livestockPlans: [] })
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
 const [productImages, setProductImages] = useState([])
 const [productEditImages, setProductEditImages] = useState([])
 const [livestockForm, setLivestockForm] = useState({ farmer_id: 1, livestock_type: '', quantity: '', unit_price: '', location: '', country: 'GH', status: 'OPEN' })
 const [livestockEdit, setLivestockEdit] = useState({ id: '', farmer_id: 1, livestock_type: '', quantity: '', unit_price: '', location: '', country: 'GH', status: 'OPEN' })
 const [livestockQuickEdit, setLivestockQuickEdit] = useState({ id: '', quantity: '', unit_price: '' })
 const [livestockImages, setLivestockImages] = useState([])
 const [livestockEditImages, setLivestockEditImages] = useState([])
 const [livestockRecordForm, setLivestockRecordForm] = useState({ user_id: '', ownership: 'Owned by Me', species: 'SHEEP', animal_type: 'EWE', name: '', ear_tag: '', farm_id: '', registration_number: '', stars: 0, date_of_birth: '', acquisition_date: '', purchased_from: '', purchased_from_type: 'BREEDER', purchase_price: '', currency: 'GHS', sire_id: '', dam_id: '', litter_size: 1, initial_weight_kg: '', breeding_type: 'Natural', castrated: false, sale_date: '', sale_price: '', sold_to: '', died_date: '', cull_keep_status: 'KEEP', cull_reason: '', health_status: '', pen_location: '', notes: '', treatment_entry: '' })
 const [livestockRecordEdit, setLivestockRecordEdit] = useState({ id: '', user_id: 1, ownership: 'Owned by Me', species: 'SHEEP', animal_type: 'EWE', name: '', ear_tag: '', farm_id: '', registration_number: '', stars: 0, date_of_birth: '', acquisition_date: '', purchased_from: '', purchased_from_type: 'BREEDER', purchase_price: '', currency: 'GHS', sire_id: '', dam_id: '', litter_size: 1, initial_weight_kg: '', breeding_type: 'Natural', castrated: false, sale_date: '', sale_price: '', sold_to: '', died_date: '', cull_keep_status: 'KEEP', cull_reason: '', health_status: '', pen_location: '', notes: '', treatment_entry: '' })
 const [selectedLivestockRecord, setSelectedLivestockRecord] = useState(null)
 const [selectedBreederDetail, setSelectedBreederDetail] = useState(null)
 const animalPhotoInputRef = useRef(null)
 const animalDocInputRef = useRef(null)
 const [animalUploads, setAnimalUploads] = useState({ photos: [], docs: [] })
 const [ultrasoundComposerOpen, setUltrasoundComposerOpen] = useState(false)
 const [ultrasoundDraft, setUltrasoundDraft] = useState({ date: '', result: '', notes: '' })
 const [moveHerdOpen, setMoveHerdOpen] = useState(false)
 const [moveHerdDraft, setMoveHerdDraft] = useState({ herd: '', notes: '' })
 const breederPhotoInputRef = useRef(null)
 const breederDocInputRef = useRef(null)
 const [breederUploads, setBreederUploads] = useState({ photos: [], docs: [] })
 const [breederReportOpen, setBreederReportOpen] = useState(false)
 const [notesScreenOpen, setNotesScreenOpen] = useState(false)
 const [notesComposerOpen, setNotesComposerOpen] = useState(false)
 const [weightComposerOpen, setWeightComposerOpen] = useState(false)
 const [medicinesScreenOpen, setMedicinesScreenOpen] = useState(false)
 const [medicineShotOpen, setMedicineShotOpen] = useState(false)
 const [medicinesSearch, setMedicinesSearch] = useState('')
 const [medicineShotDraft, setMedicineShotDraft] = useState({ medicine: '', dosage: '', notes: '' })
 const [medicineChooserOpen, setMedicineChooserOpen] = useState(false)
 const [medicineChooserSearch, setMedicineChooserSearch] = useState('')
 const [famachaComposerOpen, setFamachaComposerOpen] = useState(false)
 const [ancestorTreeOpen, setAncestorTreeOpen] = useState(false)
 const [ancestorPdfOpen, setAncestorPdfOpen] = useState(false)
 const [offspringReportOpen, setOffspringReportOpen] = useState(false)
 const [offspringListOpen, setOffspringListOpen] = useState(false)
 const [selectedOffspringRecord, setSelectedOffspringRecord] = useState(null)
 const [offspringSearch, setOffspringSearch] = useState('')
 const [markComposerOpen, setMarkComposerOpen] = useState(false)
 const [markDraft, setMarkDraft] = useState({ sire: '', dam: '', markDate: '', dueDate: '', fertilizationType: 'Natural' })
 const [flushComposerOpen, setFlushComposerOpen] = useState(false)
 const [flushDraft, setFlushDraft] = useState({ ram: '', date: '', cidrIn: '', cidrOut: '', notes: '' })
 const [famachaDraft, setFamachaDraft] = useState({ famacha: '--', bodyScore: '', weight: '', notes: '' })
 const [customMedicineComposerOpen, setCustomMedicineComposerOpen] = useState(false)
 const [customMedicineName, setCustomMedicineName] = useState('')
 const [actionBusy, setActionBusy] = useState('')
 const appScreenOpen = notesComposerOpen || weightComposerOpen || medicinesScreenOpen || medicineShotOpen || medicineChooserOpen || customMedicineComposerOpen || famachaComposerOpen || ancestorTreeOpen || ancestorPdfOpen || offspringReportOpen || offspringListOpen || markComposerOpen || flushComposerOpen || ultrasoundComposerOpen || moveHerdOpen || selectedBreederDetail || breederReportOpen || notesScreenOpen || communityInboxOpen
 const [notesSearch, setNotesSearch] = useState('')
 const [draftNote, setDraftNote] = useState('')
 const [draftWeight, setDraftWeight] = useState('')
 const [livestockRecordsFilter, setLivestockRecordsFilter] = useState('ALL')
 const [recordsSectionOpen, setRecordsSectionOpen] = useState({ create: false, edit: false, batch: false, details: false })
 const [batchMedicationForm, setBatchMedicationForm] = useState({ species:'ALL', animal_type:'ALL', health_status:'ALL', cull_keep_status:'ALL', minStars:'', pen_location:'', medication:'', dose:'', days:'' })
 const ATTACHMENT_MARKER = '\n\n[ATTACHMENTS_JSON]'
 const mapLivestockRecordToEditForm = (r) => ({
 id: r?.id || '',
 user_id: r?.user_id || me?.id || 1,
 ownership: r?.ownership || 'Owned by Me',
 species: r?.species || 'SHEEP',
 animal_type: r?.animal_type || (r?.species === 'GOAT' ? 'DOE' : (r?.species === 'CATTLE' ? 'COW' : (r?.species === 'POULTRY' ? 'LAYER_HEN' : 'EWE'))),
 name: r?.name || '',
 ear_tag: r?.ear_tag || '',
 farm_id: r?.farm_id || '',
 registration_number: r?.registration_number || '',
 stars: r?.stars ?? 0,
 date_of_birth: r?.date_of_birth || '',
 acquisition_date: r?.acquisition_date || '',
 purchased_from: r?.purchased_from || '',
 purchased_from_type: r?.purchased_from_type || 'BREEDER',
 purchase_price: r?.purchase_price ?? '',
 currency: r?.currency || 'GHS',
 sire_id: r?.sire_id || '',
 dam_id: r?.dam_id || '',
 litter_size: r?.litter_size ?? 1,
 initial_weight_kg: r?.initial_weight_kg ?? '',
 breeding_type: r?.breeding_type || 'Natural',
 castrated: !!r?.castrated,
 sale_date: r?.sale_date || '',
 sale_price: r?.sale_price ?? '',
 sold_to: r?.sold_to || '',
 died_date: r?.died_date || '',
 cull_keep_status: r?.cull_keep_status || 'KEEP',
 cull_reason: r?.cull_reason || '',
 health_status: r?.health_status || '',
 pen_location: r?.pen_location || '',
 notes: extractAttachmentsFromNotes(r?.notes || '').text || '',
 treatment_entry: ''
 })
 const [logisticsForm, setLogisticsForm] = useState({ requester_id: 1, pickup_location: '', dropoff_location: '', cargo_type: '', weight_kg: '', status: 'PENDING' })
 const [logisticsEdit, setLogisticsEdit] = useState({ id: '', requester_id: 1, pickup_location: '', dropoff_location: '', cargo_type: '', weight_kg: '', status: 'PENDING' })
 const [equipmentForm, setEquipmentForm] = useState({ requester_id: 1, equipment_type: '', duration_days: '', location: '', budget: '', status: 'PENDING' })
 const [equipmentEdit, setEquipmentEdit] = useState({ id: '', requester_id: 1, equipment_type: '', duration_days: '', location: '', budget: '', status: 'PENDING' })
 const [storageForm, setStorageForm] = useState({ requester_id: 1, storage_type: '', quantity_kg: '', location: '', duration_days: '', status: 'PENDING' })
 const [storageEdit, setStorageEdit] = useState({ id: '', requester_id: 1, storage_type: '', quantity_kg: '', location: '', duration_days: '', status: 'PENDING' })
 const [serviceImages, setServiceImages] = useState([])
 const [serviceEditImages, setServiceEditImages] = useState([])
 const [orderForm, setOrderForm] = useState({ buyer_id: 1, seller_id: 2, listing_type: 'PRODUCT', listing_id: 1, listing_title: '', quantity: 1, unit_price: '', currency: 'GHS', delivery_method: 'STANDARD', buyer_note: '' })
 const [orderPayment, setOrderPayment] = useState({ payer_id: 1, payee_id: 2, country: 'GH', method: 'MobileMoney', provider: 'MTN', currency: 'GHS', escrow_enabled: true })
 const [payoutForm, setPayoutForm] = useState({ user_id: 2, country: 'GH', payout_method: 'MOBILE_MONEY', account_name: '', bank_name: '', account_number: '', mobile_money_provider: 'MTN', mobile_money_number: '', currency: 'GHS', default_payout_method: true })
 const [payoutSettingsOpen, setPayoutSettingsOpen] = useState(false)
 const [payoutSaving, setPayoutSaving] = useState(false)
 const [buyerOrderUserId, setBuyerOrderUserId] = useState(String(me?.id || 1))
 const [sellerOrderUserId, setSellerOrderUserId] = useState(String(me?.id || 2))
 const [selectedOrder, setSelectedOrder] = useState(null)
 const [selectedReceipt, setSelectedReceipt] = useState(null)
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
 const [mapBulkPointsInput, setMapBulkPointsInput] = useState('')
 const [expandedWeatherCountry, setExpandedWeatherCountry] = useState('GH')
 const publicSectionPrefKey = 'farmsavior_public_home_sections_v1'
 const readPublicSectionPref = (key, fallback) => {
 try {
 const raw = localStorage.getItem(publicSectionPrefKey)
 if (!raw) return fallback
 const parsed = JSON.parse(raw)
 return typeof parsed?.[key] === 'boolean' ? parsed[key] : fallback
 } catch {
 return fallback
 }
 }
 const [showHighDemandProducts, setShowHighDemandProducts] = useState(() => readPublicSectionPref('showHighDemandProducts', false))
 const [showHighDemandServices, setShowHighDemandServices] = useState(() => readPublicSectionPref('showHighDemandServices', false))
 const [expandedSpotCommodity, setExpandedSpotCommodity] = useState('')
 const [expandedTradeCommodity, setExpandedTradeCommodity] = useState('')
 const [expandedTradeSections, setExpandedTradeSections] = useState({})
 const [expandedLivestockPlan, setExpandedLivestockPlan] = useState('')
 const [popularActionsOpen, setPopularActionsOpen] = useState(() => readPublicSectionPref('popularActionsOpen', true))
 const [publicRecordsOpen, setPublicRecordsOpen] = useState(() => readPublicSectionPref('publicRecordsOpen', true))
 const [publicUniversityOpen, setPublicUniversityOpen] = useState(() => readPublicSectionPref('publicUniversityOpen', true))
 const [weatherOpen, setWeatherOpen] = useState(() => readPublicSectionPref('weatherOpen', true))
 const [newsOpen, setNewsOpen] = useState(() => readPublicSectionPref('newsOpen', true))
 const [spotTradingOpen, setSpotTradingOpen] = useState(() => readPublicSectionPref('spotTradingOpen', true))
 const [governmentProgramsOpen, setGovernmentProgramsOpen] = useState(() => readPublicSectionPref('governmentProgramsOpen', true))
 const [tradeStatsOpen, setTradeStatsOpen] = useState(() => readPublicSectionPref('tradeStatsOpen', true))
 const [livestockSubscription, setLivestockSubscription] = useState({ tier: 'free', status: 'FREE', record_limit: 25, can_create_records: true, subscription: null, plans: [] })
 const [billingOverview, setBillingOverview] = useState({ subscriptions: [], active_subscriptions: [], payments: [] })
 useEffect(() => {
 try {
 localStorage.setItem(publicSectionPrefKey, JSON.stringify({
 showHighDemandProducts,
 showHighDemandServices,
 popularActionsOpen,
 publicRecordsOpen,
 publicUniversityOpen,
 weatherOpen,
 newsOpen,
 spotTradingOpen,
 governmentProgramsOpen,
 tradeStatsOpen,
 }))
 } catch {}
 }, [showHighDemandProducts, showHighDemandServices, popularActionsOpen, publicRecordsOpen, publicUniversityOpen, weatherOpen, newsOpen, spotTradingOpen, governmentProgramsOpen, tradeStatsOpen])
 const recordsBillingSubscription = useMemo(() => {
 return (billingOverview?.active_subscriptions || []).find((sub) => String(sub?.product || '') === 'livestock-records' && ['ACTIVE', 'TRIAL_ACTIVE'].includes(String(sub?.status || '').toUpperCase())) || null
 }, [billingOverview])
 const livestockPremiumResolved = livestockSubscription?.tier === 'premium' || !!recordsBillingSubscription
 const effectiveLivestockSubscription = livestockPremiumResolved
 ? {
 ...livestockSubscription,
 tier: 'premium',
 status: String(livestockSubscription?.status || recordsBillingSubscription?.status || 'ACTIVE').toUpperCase(),
 can_create_records: true,
 subscription: livestockSubscription?.subscription || recordsBillingSubscription || null,
 }
 : livestockSubscription
 const [paymentReturnNotice, setPaymentReturnNotice] = useState(null)
 const [poultryTrack, setPoultryTrack] = useState('layers')
 const [poultryZone, setPoultryZone] = useState('humid')
 const [openPoultryModule, setOpenPoultryModule] = useState(0)
 const [poultryTier, setPoultryTier] = useState('free')
 const [poultryProgress, setPoultryProgress] = useState({ completed: [] })
 const [poultryQuestion, setPoultryQuestion] = useState('')
 const [poultryAnswer, setPoultryAnswer] = useState('')
 const [poultryBillingMsg, setPoultryBillingMsg] = useState('')
 const [poultrySubscription, setPoultrySubscription] = useState({ tier: 'free', subscription: null, plans: [] })
 const [universityBillingMsg, setUniversityBillingMsg] = useState({ poultry: '', sheep: '', goat: '', cattle: '' })
 const [universitySubscriptions, setUniversitySubscriptions] = useState({ poultry: { tier: 'free', subscription: null, plans: [] }, sheep: { tier: 'free', subscription: null, plans: [] }, goat: { tier: 'free', subscription: null, plans: [] }, cattle: { tier: 'free', subscription: null, plans: [] } })
 const [poultryPlanPreview, setPoultryPlanPreview] = useState('basic')
 const [sheepPlanPreview, setSheepPlanPreview] = useState('basic')
 const [sheepTrack, setSheepTrack] = useState('balamiCross')
 const [sheepZone, setSheepZone] = useState('humid')
 const [openSheepModule, setOpenSheepModule] = useState(0)
 const [sheepTier, setSheepTier] = useState('free')
 const [sheepProgress, setSheepProgress] = useState({ completed: [] })
 const [sheepQuestion, setSheepQuestion] = useState('')
 const [sheepAnswer, setSheepAnswer] = useState('')
 const [goatPlanPreview, setGoatPlanPreview] = useState('basic')
 const [goatTrack, setGoatTrack] = useState('sahelianCross')
 const [goatZone, setGoatZone] = useState('humid')
 const [openGoatModule, setOpenGoatModule] = useState(0)
 const [goatTier, setGoatTier] = useState('free')
 const [goatProgress, setGoatProgress] = useState({ completed: [] })
 const [goatQuestion, setGoatQuestion] = useState('')
 const [goatAnswer, setGoatAnswer] = useState('')
 const [cattlePlanPreview, setCattlePlanPreview] = useState('basic')
 const [cattleTrack, setCattleTrack] = useState('wadSanga')
 const [cattleZone, setCattleZone] = useState('humid')
 const [openCattleModule, setOpenCattleModule] = useState(0)
 const [cattleTier, setCattleTier] = useState('free')
 const [cattleProgress, setCattleProgress] = useState({ completed: [] })
 const [cattleQuestion, setCattleQuestion] = useState('')
 const [cattleAnswer, setCattleAnswer] = useState('')

 const universityTierSetter = {
 poultry: setPoultryTier,
 sheep: setSheepTier,
 goat: setGoatTier,
 cattle: setCattleTier,
 }

 const setUniversityTier = (product, tier) => {
 ;(universityTierSetter[product] || (() => {}))(tier)
 }

 const setUniversityProductState = (product, next) => {
 setUniversitySubscriptions(prev => ({ ...prev, [product]: { ...(prev[product] || emptyUniversitySubscription), ...next } }))
 if (product === 'poultry') setPoultrySubscription(prev => ({ ...prev, ...next }))
 }

 const setUniversityProductMessage = (product, message) => {
 setUniversityBillingMsg(prev => ({ ...prev, [product]: message || '' }))
 if (product === 'poultry') setPoultryBillingMsg(message || '')
 }

 const isActiveSubscriptionStatus = (status) => ['ACTIVE', 'TRIAL_ACTIVE'].includes(String(status || '').toUpperCase())
 const hasActiveUniversityAccess = (product) => {
 const tier = String(universitySubscriptions[product]?.tier || '').toLowerCase()
 const status = universitySubscriptions[product]?.subscription?.status
 return ['basic', 'pro'].includes(tier) || isActiveSubscriptionStatus(status)
 }
 const openUniversityProduct = (product) => {
 setActive(paymentSectionRoute(product))
 }
 const showAlreadyActiveMessage = (product, tierOverride) => {
 const tier = String(tierOverride || universitySubscriptions[product]?.subscription?.plan_code || universitySubscriptions[product]?.tier || 'paid').toUpperCase()
 setUniversityProductMessage(product, `${paymentSectionLabel(product)} ${tier} access is already active. Open and use your program — no new checkout is needed.`)
 }
 const cachePendingCheckout = (payload) => {
 try { localStorage.setItem(PAYMENT_RETURN_CACHE_KEY, JSON.stringify({ ...(payload || {}), created_at: new Date().toISOString() })) } catch {}
 }
 const clearPendingCheckout = () => { try { localStorage.removeItem(PAYMENT_RETURN_CACHE_KEY) } catch {} }
 const readPendingCheckout = () => {
 try { return JSON.parse(localStorage.getItem(PAYMENT_RETURN_CACHE_KEY) || 'null') } catch { return null }
 }

 const handleBreederPhotoFiles = async (fileList) => {
 const files = Array.from(fileList || []).filter(Boolean)
 if (!files.length) return
 const mapped = await Promise.all(files.map(async (file) => ({
 name: file.name,
 type: file.type || 'image/*',
 size: file.size,
 url: URL.createObjectURL(file),
 })))
 setBreederUploads(prev => ({ ...prev, photos: [...(prev.photos || []), ...mapped] }))
 }

 const handleBreederDocFiles = async (fileList) => {
 const files = Array.from(fileList || []).filter(Boolean)
 if (!files.length) return
 const mapped = files.map((file) => ({
 name: file.name,
 type: file.type || 'application/octet-stream',
 size: file.size,
 }))
 setBreederUploads(prev => ({ ...prev, docs: [...(prev.docs || []), ...mapped] }))
 }

 function extractAttachmentsFromNotes (notesValue) {
  const raw = String(notesValue || '')
  const idx = raw.indexOf(ATTACHMENT_MARKER)
  if (idx < 0) return { text: raw, photos: [], docs: [] }
  const text = raw.slice(0, idx).trim()
  const blob = raw.slice(idx + ATTACHMENT_MARKER.length).trim()
  try {
   const parsed = JSON.parse(blob)
   return { text, photos: Array.isArray(parsed?.photos) ? parsed.photos : [], docs: Array.isArray(parsed?.docs) ? parsed.docs : [] }
  } catch {
   return { text: raw, photos: [], docs: [] }
  }
 }
 function mergeNotesWithAttachments (notesValue, uploads) {
  const base = extractAttachmentsFromNotes(notesValue)
  const photos = Array.isArray(uploads?.photos) ? uploads.photos : []
  const docs = Array.isArray(uploads?.docs) ? uploads.docs : []
  if (!photos.length && !docs.length) return base.text || ''
  return `${base.text || ''}${ATTACHMENT_MARKER}${JSON.stringify({ photos, docs })}`
 }

 const handleAnimalPhotoFiles = async (fileList) => {
 const files = Array.from(fileList || []).filter(Boolean)
 if (!files.length) return
 const mapped = await Promise.all(files.map(async (file) => {
  try {
   const data_url = await compressImageFileToDataUrl(file, { maxDim: 1280, quality: 0.75, maxChars: 850000 })
   return { name: file.name, type: file.type || 'image/*', size: file.size, data_url }
  } catch {
   return { name: file.name, type: file.type || 'image/*', size: file.size }
  }
 }))
 setAnimalUploads(prev => ({ ...prev, photos: [...(prev.photos || []), ...mapped] }))
 }

 const handleAnimalDocFiles = async (fileList) => {
 const files = Array.from(fileList || []).filter(Boolean)
 if (!files.length) return
 const mapped = files.map((file) => ({ name: file.name, type: file.type || 'application/octet-stream', size: file.size }))
 setAnimalUploads(prev => ({ ...prev, docs: [...(prev.docs || []), ...mapped] }))
 }

 const startUniversityCheckout = async (product, planCode, label) => {
 try {
 if (!token || !me?.id) { handleProtectedAction('onboarding', label); return }
 if (hasActiveUniversityAccess(product)) {
 showAlreadyActiveMessage(product)
 openUniversityProduct(product)
 return
 }
 const r = await api.checkoutUniversityPlan(product, { user_id: me.id, plan_code: planCode, billing_cycle: 'monthly', currency: 'GHS', country: me?.country || uiCountry })
 if (r?.already_active) {
 setUniversityProductState(product, { tier: r?.tier || universitySubscriptions[product]?.tier, subscription: r.subscription || universitySubscriptions[product]?.subscription || null })
 showAlreadyActiveMessage(product, r?.tier)
 openUniversityProduct(product)
 return
 }
 cachePendingCheckout({ type: 'university', product, plan_code: planCode, reference: r.reference })
 setUniversityProductMessage(product, r.payment_url ? `${label} created. Redirecting to payment. Ref: ${r.reference}` : (r.payment_init_error || 'Unable to initialize payment right now.'))
 setUniversityProductState(product, { subscription: r.subscription || universitySubscriptions[product]?.subscription || null })
 if (r.payment_url) window.location.href = r.payment_url
 } catch (e) {
 setUniversityProductMessage(product, errMsg(e))
 }
 }

 const verifyUniversityCheckout = async (product) => {
 const current = universitySubscriptions[product]?.subscription
 if (!current?.reference) return
 const v = await api.verifyUniversitySubscription(product, current.reference)
 const tier = v.tier || 'free'
 setUniversityTier(product, tier)
 const meSub = await api.fetchUniversitySubscriptionMe(product).catch(() => ({ tier, subscription: current }))
 setUniversityProductState(product, { tier: meSub.tier || tier, subscription: meSub.subscription || current })
 setUniversityProductMessage(product, v.message || 'Verification checked.')
 }

 useEffect(() => {

 const loadLivestockSubscription = async () => {
 if (!token) {
 setLivestockSubscription({ tier: 'free', status: 'FREE', record_limit: 25, can_create_records: true, subscription: null, plans: [] })
 setBillingOverview({ subscriptions: [], active_subscriptions: [], payments: [] })
 return
 }
 await api.syncAccountBilling().catch(() => ({ synced: [], checked_count: 0 }))
 const [sub, overview] = await Promise.all([
 api.fetchLivestockRecordsSubscriptionMe().catch(() => ({ tier: 'free', status: 'FREE', record_limit: 25, can_create_records: true, subscription: null, plans: [] })),
 api.fetchAccountBillingOverview().catch(() => ({ subscriptions: [], active_subscriptions: [], payments: [] }))
 ])
 setLivestockSubscription({
 tier: sub?.tier || 'free',
 status: sub?.status || 'NONE',
 record_limit: sub?.record_limit ?? 0,
 can_create_records: !!sub?.can_create_records,
 subscription: sub?.subscription || null,
 plans: sub?.plans || [],
 trial: sub?.trial || null,
 })
 setBillingOverview({
 subscriptions: overview?.subscriptions || [],
 active_subscriptions: overview?.active_subscriptions || [],
 payments: overview?.payments || [],
 })
 }

 const loadUniversitySubscriptions = async () => {
 if (token) await api.syncAccountBilling().catch(() => ({ synced: [], checked_count: 0 }))
 const products = await Promise.all(universityProducts.map(async (product) => {
 const plans = await api.fetchUniversityPlans(product).catch(() => ({ plans: [] }))
 if (!token) return { product, tier: 'free', subscription: null, plans: plans.plans || [] }
 const sub = await api.fetchUniversitySubscriptionMe(product).catch(() => ({ tier: 'free', subscription: null }))
 return { product, tier: sub?.tier || 'free', subscription: sub?.subscription || null, plans: plans.plans || [] }
 }))

 for (const row of products) {
 setUniversityTier(row.product, row.tier)
 setUniversityProductState(row.product, { tier: row.tier, subscription: row.subscription, plans: row.plans })
 }
 }
 loadUniversitySubscriptions().catch(() => {})
 loadLivestockSubscription().catch(() => {})
 }, [me?.id, token])
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

 useEffect(() => {
 setMobileMenuOpen(false)
 }, [active])

 useEffect(() => {
 try { localStorage.setItem('farmsavior_saved_listings', JSON.stringify(savedListings)) } catch {}
 }, [savedListings])

 useEffect(() => {
 if (!me?.id) return
 setBuyerOrderUserId(String(me.id))
 setSellerOrderUserId(String(me.id))
 setOrderForm(prev => ({ ...prev, buyer_id: Number(me.id) }))
 setPayoutForm(prev => ({ ...prev, user_id: Number(me.id) }))
 }, [me?.id])

 useEffect(() => {
 setOpenPoultryModule(0)
 }, [poultryTrack])

 const [fcmToken, setFcmToken] = useState('')
 const [diseaseForm, setDiseaseForm] = useState({ user_id: 1, category: 'animal', target: '', image_url: '', context_note: '' })
 const [diseaseImageFileName, setDiseaseImageFileName] = useState('')
 const [diseaseImagePreview, setDiseaseImagePreview] = useState('')
 const [diseaseResult, setDiseaseResult] = useState(null)
 const [diseaseAnalyzing, setDiseaseAnalyzing] = useState(false)
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
 setLivestockRecordForm(prev => ({ ...prev, user_id: meRes.id || prev.user_id }))
 setLivestockRecordEdit(prev => ({ ...prev, user_id: meRes.id || prev.user_id }))
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

 const [metrics, users, listings, livestock, livestockRecords, livestockPurchaseSources, logistics, equipment, storage, payments, orders, payoutProfiles, notifications, payoutHistory, alerts, contracts, idv, passports, regions, verificationApps, approvedAccounts, deviceTokens, diseaseScans, disputes, fraudFlags, news, publicWeather, govPrograms, spotTrading, spotHistory, tradeExportStats, livestockPlans] = await Promise.all([
 isAdmin ? api.fetchMetrics() : Promise.resolve(null), isAdmin ? api.fetchUsers() : Promise.resolve([]), api.fetchListings(), api.fetchLivestock(), api.fetchLivestockRecordsAnimals().catch(() => []), api.fetchLivestockPurchaseSources({ user_id: meRes?.id || undefined }).catch(() => []), api.fetchLogistics(), api.fetchEquipment(), api.fetchStorage(), api.fetchPayments(), api.fetchOrders().catch(() => []), api.fetchPayoutProfiles().catch(() => []), api.fetchNotifications(meRes?.id || undefined).catch(() => []), api.fetchPayoutHistory().catch(() => []), api.fetchAlerts(alertCountryFilter === 'ALL' ? undefined : alertCountryFilter), api.fetchContracts(), api.fetchIdVerifications(), api.fetchPassports(), api.fetchWeatherRegions(), isAdmin ? api.fetchVerificationApps() : Promise.resolve([]), isAdmin ? api.fetchApprovedAccounts() : Promise.resolve([]), isAdmin ? api.fetchDeviceTokens() : Promise.resolve([]), isAdmin ? api.fetchDiseaseScans() : Promise.resolve([]),
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
 setState({ metrics, users, listings, livestock, livestockRecords, livestockPurchaseSources, logistics, equipment, storage, payments, orders, payoutProfiles, notifications, payoutHistory, alerts, contracts, idv, passports, verificationApps, approvedAccounts, deviceTokens, diseaseScans, disputes, fraudFlags, news, publicWeather, govPrograms: govPrograms.items || [], spotTrading: spotTrading.items || [], spotHistory: spotHistory.items || [], tradeExportStats: tradeExportStats.items || [], livestockPlans: livestockPlans.plans || [] })
 const myPayoutProfile = (payoutProfiles || []).find(x => String(x.user_id) === String(meRes?.id || ''))
 if (myPayoutProfile) {
 setPayoutForm(prev => ({
 ...prev,
 user_id: Number(meRes?.id || prev.user_id),
 country: myPayoutProfile.country || prev.country,
 payout_method: myPayoutProfile.payout_method || prev.payout_method,
 account_name: myPayoutProfile.account_name || '',
 bank_name: myPayoutProfile.bank_name || '',
 account_number: myPayoutProfile.account_number || '',
 mobile_money_provider: myPayoutProfile.mobile_money_provider || 'MTN',
 mobile_money_number: myPayoutProfile.mobile_money_number || '',
 currency: myPayoutProfile.currency || prev.currency,
 default_payout_method: typeof myPayoutProfile.default_payout_method === 'boolean' ? myPayoutProfile.default_payout_method : prev.default_payout_method
 }))
 }
 }

 const loadLivestockRecords = async () => {
 const [rows, sources] = await Promise.all([
 api.fetchLivestockRecordsAnimals().catch(() => []),
 api.fetchLivestockPurchaseSources({ user_id: me?.id || undefined }).catch(() => [])
 ])
 setState(prev => ({ ...prev, livestockRecords: rows || [], livestockPurchaseSources: sources || [] }))
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
 const [p, posts, feed, followState, threads] = await Promise.all([
 api.fetchCommunityProfileMe().catch(() => null),
 api.fetchCommunityPosts(80).catch(() => []),
 api.fetchCommunityFeed(communityFeedMode === 'following' ? 'following' : 'for-you', 60).catch(() => []),
 api.fetchCommunityFollowState().catch(() => ({ following_ids: [], following_count: 0, followers_count: 0, following: [], muted_ids: [], muted_count: 0 })),
 api.fetchCommunityMessageThreads().catch(() => [])
 ])
 if (p && !communityProfileDirty && !communityProfileSaving) {
 setCommunityProfile(p)
 setCommunityProfileBaseline(p)
 }
 setCommunityPosts(posts || [])
 setCommunityFeedItems(feed || [])
 setCommunityFollowState(followState || { following_ids: [], following_count: 0, followers_count: 0, following: [], muted_ids: [], muted_count: 0 })
 setCommunityMessageThreads(threads || [])
 }

 useEffect(() => { if (token) load().catch(console.error) }, [token, alertCountryFilter])
 useEffect(() => { if (token) loadLivestockRecords().catch(console.error) }, [token])

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

 const busyLabel = (key, idle, loading='Working…') => actionBusy === key ? loading : idle

 useEffect(() => {
 document.body.style.overflow = appScreenOpen ? 'hidden' : ''
 if (appScreenOpen) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' })
 return () => { document.body.style.overflow = '' }
 }, [appScreenOpen])

 useEffect(() => {
 if (!token) return
 if ((me?.role || '').toLowerCase() !== 'admin') return
 loadWorldChatQueue().catch(() => {})
 const id = setInterval(() => { loadWorldChatQueue().catch(() => {}) }, 8000)
 return () => clearInterval(id)
 }, [token, me?.role])

 useEffect(() => {
 document.body.style.overflow = appScreenOpen ? 'hidden' : ''
 if (appScreenOpen) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' })
 return () => { document.body.style.overflow = '' }
 }, [appScreenOpen])

 useEffect(() => {
 if (!token) return
 loadCommunity().catch(() => {})
 const id = setInterval(() => { loadCommunity().catch(() => {}) }, 7000)
 return () => clearInterval(id)
 }, [token, communityProfileDirty, communityFeedMode])

 useEffect(() => {
 if (!token) return
 const query = String(communityUserSearch || '').trim()
 const timer = setTimeout(async () => {
 try {
 const rows = await api.searchCommunityUsers(query, query ? 18 : 10)
 setCommunityUserResults(rows || [])
 } catch {
 setCommunityUserResults([])
 }
 }, query ? 250 : 0)
 return () => clearTimeout(timer)
 }, [token, communityUserSearch, communityFollowState?.following_count])

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

 const target = pendingFeatureSection || 'home'
 setPendingFeatureSection('')
 setPendingFeatureLabel('')
 goToAppSection(target)
 }

 const goToPublicHomepage = () => {
 try { localStorage.removeItem('farmsavior_resume_section') } catch {}
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
 setPendingFeatureSection(section || 'home')
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
 setMapPointInput('')
 }

 const addBulkPoints = () => {
 const raw = String(mapBulkPointsInput || '').trim()
 if (!raw) return
 const rows = raw
 .split(/\n|;/)
 .map(r => r.trim().replace(/[()]/g, ''))
 .filter(Boolean)

 const parsed = []
 for (const row of rows) {
 const parts = row.split(',').map(x => x.trim())
 if (parts.length !== 2) continue
 const lat = Number(parts[0])
 const lng = Number(parts[1])
 if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
 parsed.push({ lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) })
 }

 if (!parsed.length) return alert('No valid points found. Use one point per line: lat,lng')

 setMapPolygonPoints(prev => [...prev, ...parsed])
 const last = parsed[parsed.length - 1]
 setFarmMapForm(prev => ({ ...prev, gps_lat: `${last.lat}`, gps_lng: `${last.lng}` }))
 setMapBulkPointsInput('')
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

 const baseMenu = ['home', 'dashboard', 'ai-disease', 'poultry-university', 'sheep-university', 'goat-university', 'cattle-university', 'livestock-records', 'onboarding', 'products', 'livestock', 'services', 'payments', 'alerts', 'maps', 'world-chat', 'community', 'government', 'contracts']
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
 'poultry-university':'Poultry University',
 'sheep-university':'Sheep University',
 'goat-university':'Goat University',
 'cattle-university':'Cattle University',
 'plant-id':t('AI Plant Identifier','AI Plant Identifier','AI 植物识别'),
 'pest-id':t('AI Insect & Pest Identifier','AI Insect & Pest Identifier','AI 昆虫与害虫识别'),
 'government':t('Government Programs','Government Programs','政府项目'),
 'contracts':t('contracts','contracts','合同'),
 'admin':t('admin','admin','管理员')
 }[m] || m)

 const livestockRecordsFiltered = useMemo(() => {
 if (livestockRecordsFilter === 'ALL') return state.livestockRecords
 if (livestockRecordsFilter === 'GOAT') return state.livestockRecords.filter(r => r.species === 'GOAT')
 if (livestockRecordsFilter === 'SHEEP') return state.livestockRecords.filter(r => r.species === 'SHEEP')
 if (livestockRecordsFilter === 'CATTLE') return state.livestockRecords.filter(r => r.species === 'CATTLE')
 if (livestockRecordsFilter === 'POULTRY') return state.livestockRecords.filter(r => r.species === 'POULTRY')
 return state.livestockRecords
 }, [state.livestockRecords, livestockRecordsFilter])
 const livestockRecordsCounts = useMemo(() => ({
 ALL: state.livestockRecords.length,
 SHEEP: state.livestockRecords.filter(r => r.species === 'SHEEP').length,
 GOAT: state.livestockRecords.filter(r => r.species === 'GOAT').length,
 CATTLE: state.livestockRecords.filter(r => r.species === 'CATTLE').length,
 POULTRY: state.livestockRecords.filter(r => r.species === 'POULTRY').length,
 }), [state.livestockRecords])
 const livestockRecordsSummary = useMemo(() => ({
 active: state.livestockRecords.filter(r => !r.sale_date && !r.died_date).length,
 needsAttention: state.livestockRecords.filter(r => String(r.health_status || '').trim() && !String(r.health_status || '').toLowerCase().includes('healthy')).length,
 bred: state.livestockRecords.filter(r => r.sire_id || r.dam_id || r.litter_size > 1).length,
 }), [state.livestockRecords])
 const currentLivestockRecord = selectedOffspringRecord || selectedLivestockRecord

 useEffect(() => {
 if (!selectedLivestockRecord?.id) return
 setLivestockRecordEdit(mapLivestockRecordToEditForm(selectedLivestockRecord))
 }, [selectedLivestockRecord])

 const kpis = useMemo(() => [
 ['Users', state.metrics?.users_total || 0],
 ['Listings', state.metrics?.listings_total || 0],
 ['Logistics', state.metrics?.logistics_total || 0],
 ['Payments', state.metrics?.payments_total || 0],
 ['Contracts', state.metrics?.contracts_total || 0],
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

 useEffect(() => {
 if (!token) return
 const reference = searchParams.get('reference') || searchParams.get('trxref')
 const pending = readPendingCheckout()
 if (!reference || !pending?.reference || pending.reference !== reference) return
 ;(async () => {
 try {
 if (pending.type === 'livestock') {
 const verified = await api.verifyLivestockRecordsSubscription(reference)
 await load()
 setActive('onboarding')
 setPaymentReturnNotice({
 title: 'Thanks — your Livestock Records upgrade is active.',
 message: verified?.message || 'Your premium livestock workspace has been confirmed and is ready to use.',
 reference,
 verified_at: new Date().toISOString(),
 section: 'livestock-records',
 })
 } else if (pending.type === 'university' && pending.product) {
 const verified = await api.verifyUniversitySubscription(pending.product, reference)
 await load()
 setActive('onboarding')
 setPaymentReturnNotice({
 title: `Thanks — your ${paymentSectionLabel(pending.product)} access is ready.`,
 message: verified?.message || 'Your university subscription has been confirmed and the full content is now available.',
 reference,
 verified_at: new Date().toISOString(),
 section: paymentSectionRoute(pending.product),
 })
 }
 clearPendingCheckout()
 try {
 const url = new URL(window.location.href)
 url.searchParams.delete('reference')
 url.searchParams.delete('trxref')
 window.history.replaceState({}, '', url.toString())
 } catch {}
 } catch (e) {
 console.error('Payment return verification failed', e)
 }
 })()
 }, [token])

 const selectedCurrency = currencyByCountry[uiCountry] || 'USD'
 const formatLocalPrice = (usd) => {
 const amount = Number(usd || 0) * (fxByCurrency[selectedCurrency] || 1)
 try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: selectedCurrency, maximumFractionDigits: 2 }).format(amount) }
 catch { return `${selectedCurrency} ${amount.toFixed(2)}` }
 }

 const showPublicLanding = !token || forcePublicView

 if (showPublicLanding) return <div className='authWrap'>
 <div className='authCard' style={{width:'min(1180px,98vw)'}}>
 <div className='panel' style={{background:'linear-gradient(135deg,#0f172a 0%,#0e7490 42%,#16a34a 100%)', color:'#fff', border:'1px solid rgba(255,255,255,.08)', boxShadow:'0 28px 70px rgba(15,23,42,.22)', overflow:'hidden', position:'relative'}}>
 <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:8}}>
 <img src='/assets/farmsavior-logo.jpg' alt='FarmSavior logo' style={{width:72,height:72,borderRadius:12,objectFit:'cover',border:'2px solid rgba(255,255,255,.3)'}} />
 <h2 style={{margin:0}}>{isZh ? 'FarmSavior 市场实时' : t('FarmSavior Marketplace Live','Marché FarmSavior en direct')}</h2>
 </div>
 <p style={{opacity:.95, fontSize:'1rem', lineHeight:1.6, maxWidth:760}}>{isZh ? '覆盖加纳、尼日利亚和布基纳法索的高需求产品与服务。可自由浏览；联系服务商或使用工具请注册/登录。' : t('High-demand products and services across Ghana, Nigeria, and Burkina Faso. Browse freely. To contact providers or use tools, sign up/sign in.','Produits et services à forte demande au Ghana, au Nigeria et au Burkina Faso. Parcourez librement. Pour contacter les fournisseurs ou utiliser les outils, inscrivez-vous/connectez-vous.')}</p>
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

 <div className='three-col' style={{marginTop:14, alignItems:'stretch'}}>
 <article className='panel' style={{minHeight: showHighDemandProducts ? 430 : 'auto', background:'linear-gradient(180deg,#ffffff 0%,#f8fafc 100%)'}}>
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
 return <div className='list-row' key={`p-${i}`} role='button' tabIndex={0} onClick={() => setPublicDetail({ title: displayProductName(x.name), subtitle: 'High demand product listing preview', stats: [`${inventory.toLocaleString()} in marketplace`, 'Public preview'], images: [], section: 'products' })}><span>{displayProductName(x.name)}</span><strong>{inventory.toLocaleString()}</strong></div>
 })}
 </div>}
 </article>

 <article className='panel' style={{minHeight: showHighDemandServices ? 430 : 'auto', background:'linear-gradient(180deg,#ffffff 0%,#f8fafc 100%)'}}>
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
 return <div className='list-row' key={`s-${i}`} role='button' tabIndex={0} onClick={() => setPublicDetail({ title: displayServiceName(x.name), subtitle: 'High demand service listing preview', stats: [`${inventory.toLocaleString()} in marketplace`, 'Public preview'], images: [], section: 'services' })}><span>{displayServiceName(x.name)}</span><strong>{inventory.toLocaleString()}</strong></div>
 })}
 </div>}
 </article>

 <article className='panel' style={{background:'linear-gradient(180deg,#ffffff 0%,#f8fafc 100%)'}}>
 <div className='section-header'>
 <div>
 <h3 style={{margin:0}}>{t('🧠 Popular Actions','🧠 Actions populaires','🧠 热门操作')}</h3>
 <div className='helper-text' style={{marginTop:4}}>Fast entry points for the most important workflows in FarmSavior.</div>
 </div>
 <button type='button' className='btn' style={{marginLeft:'auto'}} onClick={() => setPopularActionsOpen(v => !v)}>{popularActionsOpen ? t('Hide','Masquer','隐藏') : t('Show','Afficher','显示')}</button>
 </div>
 {popularActionsOpen && <div className='list'>
 <div className='list-row'><span>{t('AI Disease Analyzer','Analyseur IA des maladies','AI 病害分析')}</span><button type='button' className='btn btn-dark' onClick={()=>handleProtectedAction('ai-disease', 'AI Disease Analyzer')}>{t('Open','Ouvrir')}</button></div>
 <div className='list-row'><span>{t('Livestock Records Management','Gestion des registres du bétail','牲畜档案管理')}</span><button type='button' className='btn btn-dark' onClick={()=>handleProtectedAction('livestock-records', 'Livestock Records Management')}>{t('Open','Ouvrir')}</button></div>
 <div className='list-row'><span>AADU · Poultry University (Layers • Broilers • Guinea Fowl)</span><button type='button' className='btn' onClick={()=>handleProtectedAction('poultry-university', 'Poultry University')}>{t('Open','Ouvrir')}</button></div>
 <div className='list-row'><span>AADU · Sheep University (Ghana Sheep Breed Program)</span><button type='button' className='btn' onClick={()=>handleProtectedAction('sheep-university', 'Sheep University')}>{t('Open','Ouvrir')}</button></div>
 <div className='list-row'><span>AADU · Goat University (Ghana Goat Breed Program)</span><button type='button' className='btn' onClick={()=>handleProtectedAction('goat-university', 'Goat University')}>{t('Open','Ouvrir')}</button></div>
 <div className='list-row'><span>AADU · Cattle University (Ghana Cattle Breed Program)</span><button type='button' className='btn' onClick={()=>handleProtectedAction('cattle-university', 'Cattle University')}>{t('Open','Ouvrir')}</button></div>
 <div className='list-row'><span>{t('List Product','Publier un produit','发布产品')}</span><button type='button' className='btn' onClick={()=>handleProtectedAction('products', 'List Product')}>{t('Start','Démarrer')}</button></div>
 <div className='list-row'><span>{t('List Services','Publier des services','发布服务')}</span><button type='button' className='btn' onClick={()=>handleProtectedAction('services', 'List Services')}>{t('Start','Démarrer')}</button></div>
 <div className='list-row'><span>{t('List Machinery for Rent','Publier des machines à louer','发布机械租赁')}</span><button type='button' className='btn' onClick={()=>handleProtectedAction('services', 'List Machinery for Rent')}>{t('Start','Démarrer')}</button></div>
 <div className='list-row'><span>{t('Rent Machinery','Louer des machines','租用机械')}</span><button type='button' className='btn' onClick={()=>handleProtectedAction('services', 'Rent Machinery')}>{t('Start','Démarrer')}</button></div>
 <div className='list-row'><span>{t('Request Logistics / Transport','Demander logistique / transport','请求物流/运输')}</span><button type='button' className='btn' onClick={()=>handleProtectedAction('services', 'Request Logistics / Transport')}>{t('Start','Démarrer')}</button></div>
 <div className='list-row'><span>{t('Find Storage / Cold Room','Trouver stockage / chambre froide','寻找仓储/冷库')}</span><button type='button' className='btn' onClick={()=>handleProtectedAction('services', 'Find Storage / Cold Room')}>{t('Start','Démarrer')}</button></div>
 <div className='list-row'><span>{t('Farm GPS Mapping','Cartographie GPS des fermes','农场GPS标注')}</span><button type='button' className='btn' onClick={()=>handleProtectedAction('maps', 'Farm GPS Mapping')}>{t('Open','Ouvrir')}</button></div>
 <div className='list-row'><span>{t('Global World Chat','Chat mondial','全球聊天')}</span><button type='button' className='btn' onClick={()=>handleProtectedAction('world-chat', 'Global World Chat')}>{t('Open','Ouvrir','打开')}</button></div>
 </div>}
 <p style={{fontSize:'.82rem', color:'#64748b'}}>{t('You can browse publicly; posting, renting, contacting providers, and transactions require sign-in.','Vous pouvez parcourir publiquement ; publier, louer, contacter des prestataires et effectuer des transactions nécessite une connexion.','你可以公开浏览；发布、租赁、联系服务商和交易需要登录。')}</p>
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

 <div className='tabs'>{['login', 'signup', ...(authMode === 'verify-otp' ? ['verify-otp'] : [])].map(m => <button key={m} className={`tab ${authMode === m ? 'active' : ''}`} onClick={() => setAuthMode(m)}>{m === 'login' ? t('LOGIN','LOGIN','登录') : m === 'signup' ? t('SIGNUP','INSCRIPTION','注册') : t('Verify OTP','Vérifier OTP','验证 OTP')}</button>)}</div>

 {authMode === 'signup' && <form className='list' noValidate onSubmit={async (e) => {
 try {
 e.preventDefault();
 setAuthLoading(true)
 const form = new FormData(e.currentTarget)
 const fullNameValue = String(form.get('full_name') || signup.full_name || '').trim()
 const emailValue = String(form.get('email') || signup.email || '').trim().toLowerCase()
 const phoneValue = normalizePhone(String(form.get('phone') || signup.phone || ''))
 const countryValue = String(form.get('country') || signup.country || '').trim()
 const regionValue = String(form.get('region') || signup.region || '').trim()
 const passwordValue = String(form.get('password') || signup.password || '').trim()
 const signupMethodValue = signup.signup_method
 if (!signup.accept_terms || !signup.accept_privacy) { setAuthMsg('Please accept Terms and Privacy to continue.'); return }
 if (!fullNameValue) { setAuthMsg('Please enter your full name.'); return }
 if (!countryValue) { setAuthMsg('Please enter your country.'); return }
 if (!regionValue) { setAuthMsg('Please enter your region.'); return }
 if (!passwordValue) { setAuthMsg('Please enter a password.'); return }
 if (signupMethodValue === 'phone' && !phoneValue) { setAuthMsg('Please enter a valid phone number.'); return }
 if (signupMethodValue === 'email' && !emailValue) { setAuthMsg('Please enter your email address.'); return }
 if (signupMethodValue === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) { setAuthMsg('Please enter a valid email address.'); return }
 setSignup(prev => ({ ...prev, full_name: fullNameValue, email: emailValue || prev.email, phone: phoneValue || prev.phone, country: countryValue, region: regionValue, password: passwordValue }))
 const payload = {
 full_name: fullNameValue,
 signup_method: signupMethodValue,
 phone: signupMethodValue === 'phone' ? phoneValue : undefined,
 email: signupMethodValue === 'email' ? emailValue : undefined,
 country: countryValue,
 region: regionValue,
 user_type: signup.user_type,
 password: passwordValue,
 }
 const registerRes = await api.register(payload)
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
 const destination = registerRes?.otp_destination || (signup.signup_method === 'email' ? signup.email.trim().toLowerCase() : normalizePhone(signup.phone))
 setOtp({ destination, code: '' })
 setAuthMode('verify-otp')
 setAuthMsg(registerRes?.otp_sent
 ? `Account created. Enter the OTP sent to ${destination}.`
 : `Account created, but OTP delivery was not confirmed for ${destination}. Check backend mail/SMS sender settings or use the returned fallback code if shown.`)
 } catch (e) { setAuthMsg(`Signup failed: ${errMsg(e)}`) }
 finally { setAuthLoading(false) }
 }}>
 <input className='input' name='full_name' autoComplete='name' placeholder='Full name' value={signup.full_name} onChange={e => setSignup({ ...signup, full_name: e.target.value })} onInput={e => setSignup({ ...signup, full_name: e.target.value })} required />
 <div className='row2' style={{gap:10}}>
 <button type='button' className={`btn ${signup.signup_method === 'phone' ? 'btn-dark' : ''}`} onClick={() => setSignup({ ...signup, signup_method: 'phone' })}>Phone OTP</button>
 <button type='button' className={`btn ${signup.signup_method === 'email' ? 'btn-dark' : ''}`} onClick={() => setSignup({ ...signup, signup_method: 'email' })}>Email OTP</button>
 </div>
 {signup.signup_method === 'phone'
 ? <input className='input' name='phone' autoComplete='tel' placeholder='Phone' value={signup.phone} onChange={e => setSignup({ ...signup, phone: e.target.value })} onInput={e => setSignup({ ...signup, phone: e.target.value })} required />
 : <input className='input' name='email' autoComplete='email' type='email' placeholder='Email' value={signup.email} onChange={e => setSignup({ ...signup, email: e.target.value })} onInput={e => setSignup({ ...signup, email: e.target.value })} required />}
 <div style={{fontSize:'.76rem', color:'#64748b'}}>{signup.signup_method === 'email' ? 'OTP will be sent to the email address you enter.' : 'OTP will be sent to the phone number you enter.'}</div>
 <div className='row2' style={{gap:10}}>
 <input className='input' name='country' autoComplete='country-name' placeholder='Country (any code or name, e.g. US, KE, Brazil)' value={signup.country} onChange={e => setSignup({ ...signup, country: e.target.value })} onInput={e => setSignup({ ...signup, country: e.target.value })} required />
 <input className='input' name='region' autoComplete='address-level1' placeholder='Region' value={signup.region} onChange={e => setSignup({ ...signup, region: e.target.value })} onInput={e => setSignup({ ...signup, region: e.target.value })} required />
 </div>
 <select className='input' value={signup.user_type} onChange={e => setSignup({ ...signup, user_type: e.target.value })}>{userTypes.map(u => <option key={u}>{u}</option>)}</select>
 <input className='input' name='password' autoComplete='new-password' type='password' placeholder={t('Password','Mot de passe','密码')} value={signup.password} onChange={e => setSignup({ ...signup, password: e.target.value })} onInput={e => setSignup({ ...signup, password: e.target.value })} required />
 <div className='panel' style={{padding:8, background:'#f8fafc'}}>
 <label style={{display:'block',fontSize:'.84rem'}}><input type='checkbox' checked={signup.accept_terms} onChange={e => setSignup({ ...signup, accept_terms: e.target.checked })} /> I agree to Terms of Service.</label>
 <label style={{display:'block',fontSize:'.84rem'}}><input type='checkbox' checked={signup.accept_privacy} onChange={e => setSignup({ ...signup, accept_privacy: e.target.checked })} /> I agree to Privacy Policy.</label>
 <label style={{display:'block',fontSize:'.84rem'}}><input type='checkbox' checked={signup.consent_analytics} onChange={e => setSignup({ ...signup, consent_analytics: e.target.checked })} /> Help improve FarmSavior with usage analytics.</label>
 <label style={{display:'block',fontSize:'.84rem'}}><input type='checkbox' checked={signup.consent_personalization} onChange={e => setSignup({ ...signup, consent_personalization: e.target.checked })} /> Personalize feed, recommendations, and alerts.</label>
 <label style={{display:'block',fontSize:'.84rem'}}><input type='checkbox' checked={signup.consent_marketing} onChange={e => setSignup({ ...signup, consent_marketing: e.target.checked })} /> Receive product updates and offers.</label>
 <label style={{display:'block',fontSize:'.84rem'}}><input type='checkbox' checked={signup.consent_aggregated_insights} onChange={e => setSignup({ ...signup, consent_aggregated_insights: e.target.checked })} /> Allow anonymized aggregated insights for ecosystem reports.</label>
 <div style={{fontSize:'.76rem', color:'#64748b', marginTop:6}}>You can update these preferences anytime in account settings.</div>
 </div>
 <button className='btn btn-dark' disabled={authLoading}>{authLoading ? 'FarmSavior is creating your account…' : 'Create Account'}</button>
 {authLoading && <div className='panel' style={{padding:10, display:'flex', alignItems:'center', gap:10}}><div style={{fontSize:'1.2rem'}}>🌿</div><div><strong>FarmSavior</strong><div style={{fontSize:'.85rem', color:'#64748b'}}>Please wait while we create your account and contact the OTP service…</div></div></div>}
 </form>}

 {authMode === 'login' && <form className='list' onSubmit={async (e) => {
 try { e.preventDefault(); setAuthLoading(true); const r = await api.login({ ...login, identifier: normalizeIdentifier(login.identifier) }); saveToken(r.access_token) } catch (e) { setAuthMsg(`Login failed: ${errMsg(e)}`) } finally { setAuthLoading(false) }
 }}>
 <input className='input' placeholder={t('Phone or Email','Téléphone ou e-mail','手机号或邮箱')} value={login.identifier} onChange={e => setLogin({ ...login, identifier: e.target.value })} required />
 <input className='input' type='password' placeholder={t('Password','Mot de passe','密码')} value={login.password} onChange={e => setLogin({ ...login, password: e.target.value })} required />
 <button className='btn btn-dark' disabled={authLoading}>{authLoading ? 'FarmSavior is signing you in…' : t('Login','Connexion','登录')}</button>
 {authLoading && <div className='panel' style={{padding:10, display:'flex', alignItems:'center', gap:10}}><div style={{fontSize:'1.2rem'}}>🌿</div><div><strong>FarmSavior</strong><div style={{fontSize:'.85rem', color:'#64748b'}}>Connecting to your account…</div></div></div>}
 </form>}

 {authMode === 'verify-otp' && <form className='list' onSubmit={async (e) => {
 try {
 e.preventDefault()
 setAuthLoading(true)
 const r = await api.verifyOtp({ destination: otp.destination, code: otp.code })
 saveToken(r.access_token)
 setAuthMsg('Phone verified and account signed in successfully.')
 } catch (e) { setAuthMsg(`OTP verification failed: ${errMsg(e)}`) }
 finally { setAuthLoading(false) }
 }}>
 <input className='input' placeholder='OTP destination' value={otp.destination} onChange={e => setOtp({ ...otp, destination: e.target.value })} required />
 <input className='input' placeholder={t('OTP Code','Code OTP','验证码')} value={otp.code} onChange={e => setOtp({ ...otp, code: e.target.value })} required />
 <button className='btn btn-dark' disabled={authLoading}>{authLoading ? 'FarmSavior is verifying your OTP…' : t('Verify OTP','Vérifier OTP','验证 OTP')}</button>
 {authLoading && <div className='panel' style={{padding:10, display:'flex', alignItems:'center', gap:10}}><div style={{fontSize:'1.2rem'}}>🌿</div><div><strong>FarmSavior</strong><div style={{fontSize:'.85rem', color:'#64748b'}}>Verifying your code…</div></div></div>}
 </form>}

 </>}
 <p>{authMsg}</p>
 </article>

 <article className='panel' style={{marginTop:12, background:effectiveLivestockSubscription?.tier === 'premium' ? 'linear-gradient(135deg,#0f172a 0%,#155e75 55%,#16a34a 100%)' : 'linear-gradient(180deg,#ffffff 0%,#f8fafc 100%)', color:effectiveLivestockSubscription?.tier === 'premium' ? '#fff' : '#0f172a', border:effectiveLivestockSubscription?.tier === 'premium' ? '1px solid rgba(255,255,255,.12)' : '1px solid #dbe5ef'}}>
 <div className='section-header'>
 <div>
 <h3 style={{margin:0}}>{t('Livestock Records','Registres du bétail','牲畜档案')}</h3>
 <div className='helper-text' style={{marginTop:4, color:effectiveLivestockSubscription?.tier === 'premium' ? 'rgba(255,255,255,.82)' : '#64748b'}}>Structured animal records, premium herd-management workflows, and direct access to the records workspace.</div>
 </div>
 <button type='button' className='btn' style={{marginLeft:'auto'}} onClick={() => setPublicRecordsOpen(v => !v)}>{publicRecordsOpen ? t('Hide','Masquer','隐藏') : t('Show','Afficher','显示')}</button>
 </div>
 {publicRecordsOpen && <div className='list'>
 <div className='list-row' style={{background:effectiveLivestockSubscription?.tier === 'premium' ? 'rgba(255,255,255,.08)' : '#fff', border:effectiveLivestockSubscription?.tier === 'premium' ? '1px solid rgba(255,255,255,.12)' : '1px solid #e2e8f0'}}>
 <span>{effectiveLivestockSubscription?.tier === 'premium' ? 'Livestock Records Premium ✓' : 'Unlock Livestock Records Premium'}</span>
 <strong>{effectiveLivestockSubscription?.tier === 'premium' ? 'Paid tier active' : (effectiveLivestockSubscription?.record_limit ? `Free tier · up to ${effectiveLivestockSubscription.record_limit} animals` : 'Free tier')}</strong>
 </div>
 <div style={{maxWidth:760, color:effectiveLivestockSubscription?.tier === 'premium' ? 'rgba(255,255,255,.88)' : '#334155', lineHeight:1.6}}>
 {effectiveLivestockSubscription?.tier === 'premium'
 ? `Your account is on the premium tier${effectiveLivestockSubscription?.subscription?.plan_code ? ` • ${String(effectiveLivestockSubscription.subscription.plan_code).toUpperCase()}` : ''}. Enjoy unlimited records, attachment-ready workflows, and a cleaner operator experience.`
 : `You are on the free livestock tier${effectiveLivestockSubscription?.record_limit ? ` with up to ${effectiveLivestockSubscription.record_limit} animals` : ''}. Upgrade to unlock unlimited records and a more complete herd-management workspace.`}
 </div>
 <div className='card-actions'>
 <button className={`btn ${effectiveLivestockSubscription?.tier === 'premium' ? '' : 'btn-dark'}`} onClick={() => { if (token) window.location.href='/?public=0&go=livestock-records'; else setActive('livestock-records') }}>{effectiveLivestockSubscription?.tier === 'premium' ? 'Open records' : 'View upgrade plans'}</button>
 <button className='btn' onClick={() => setActive('onboarding')}>My billing</button>
 </div>
 </div>}
 </article>

 <article className='panel' style={{marginTop:12, background:'linear-gradient(180deg,#ffffff 0%,#f8fafc 100%)'}}>
 <div className='section-header'>
 <div>
 <h3 style={{margin:0}}>{AADU_FULL_NAME} (AADU)</h3>
 <div className='helper-text' style={{marginTop:4}}>FarmSavior’s flagship livestock learning platform, now placed directly on the public homepage.</div>
 </div>
 <button type='button' className='btn' style={{marginLeft:'auto'}} onClick={() => setPublicUniversityOpen(v => !v)}>{publicUniversityOpen ? t('Hide','Masquer','隐藏') : t('Show','Afficher','显示')}</button>
 </div>
 {publicUniversityOpen && <div className='aadu-public-home'>
 <div className='aadu-home-hero'>
 <div className='aadu-home-copy'>
 <div className='aadu-home-eyebrow'>Flagship learning platform</div>
 <h3>{AADU_FULL_NAME} (AADU)</h3>
 <p>{AADU_FULL_NAME} (AADU) is FarmSavior’s livestock learning hub, combining Poultry, Sheep, Goat, and Cattle University in one place.</p>
 <p>Practical lessons only: setup, breed improvement, health, and performance.</p>
 </div>
 <div className='aadu-home-aside'>
 <div className='aadu-home-aside-label'>Inside AADU</div>
 <div className='aadu-home-aside-list'>
 <div><strong>4</strong><span>live schools</span></div>
 <div><strong>Livestock-first</strong><span>digital training under one AADU umbrella</span></div>
 </div>
 </div>
 </div>
 <div className='aadu-home-grid'>
 {homeUniversityShowcase.map((school) => (
 <article key={`public-${school.key}`} className='aadu-school-card'>
 <div className='aadu-school-label'>AADU school</div>
 <h4>{school.title}</h4>
 <p>{school.summary}</p>
 <div className='aadu-school-actions'>
 <button type='button' className='btn btn-dark' onClick={() => handleProtectedAction(school.route, school.title)}>{token ? 'Open' : 'Enroll / Open'}</button>
 <button type='button' className='btn' onClick={() => token ? (window.location.href = `/?public=0&go=${school.route}`) : handleProtectedAction(school.route, school.title)}>{token ? 'Go to school' : 'Preview access'}</button>
 </div>
 </article>
 ))}
 </div>
 </div>}
 </article>

 <div className='panel' style={{marginTop:10,padding:12,background:'#f8fafc', border:'1px solid #e2e8f0'}}>
 <div style={{fontSize:'.9rem', color:'#334155', lineHeight:1.5}}>
 FarmSavior is a digital agricultural platform operated in Ghana by Sheep Ghana Limited.
 </div>
 </div>

 <div className='panel' style={{marginTop:10,padding:10,background:'#f8fafc'}}>
 <h4 style={{margin:'0 0 6px'}}>{isZh ? '📲 下载到手机' : t('📲 Download App to Phone','📲 Télécharger l’application sur le téléphone','📲 下载到手机')}</h4>
 <div style={{fontSize:'.84rem',color:'#334155'}}>
 <div><strong>{isZh ? 'iPhone（Safari）：' : t('iPhone (Safari):','iPhone (Safari) :','iPhone（Safari）：')}</strong> {isZh ? '打开 farmsavior.com → 分享 → 添加到主屏幕。' : t('Open farmsavior.com → Share → Add to Home Screen.','Ouvrez farmsavior.com → Partager → Sur l’écran d’accueil.','打开 farmsavior.com → 分享 → 添加到主屏幕。')}</div>
 <div><strong>{isZh ? 'Android（Chrome）：' : t('Android (Chrome):','Android (Chrome) :','Android（Chrome）：')}</strong> {isZh ? '打开 farmsavior.com → ⋮ 菜单 → 安装应用 / 添加到主屏幕。' : t('Open farmsavior.com → ⋮ menu → Install app / Add to Home screen.','Ouvrez farmsavior.com → menu ⋮ → Installer l’app / Ajouter à l’écran d’accueil.','打开 farmsavior.com → ⋮ 菜单 → 安装应用 / 添加到主屏幕。')}</div>
 </div>
 </div>

 <article className='panel' style={{marginTop:10}}>
 <div className='section-header' style={{marginTop:12}}>
 <h3 style={{margin:0}}>{t('📈 Spot Trading (Ghana • Nigeria • Burkina Faso • World Avg)','📈 Trading Spot (Ghana • Nigeria • Burkina Faso • Moyenne mondiale)','📈 现货交易（加纳 • 尼日利亚 • 布基纳法索 • 全球均值）')}</h3>
 <div style={{display:'flex', gap:8, marginLeft:'auto'}}>
 <button type='button' className='btn' onClick={() => setSpotTradingOpen(v => !v)}>{spotTradingOpen ? t('Hide','Masquer','隐藏') : t('Show','Afficher','显示')}</button>
 <button className='btn' onClick={() => window.print()}>{t('Export Briefing (PDF)','Exporter le briefing (PDF)','导出简报（PDF）')}</button>
 </div>
 </div>
 {spotTradingOpen && <>
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
 </>}
 </article> </div>

 <div className='two-col' style={{marginTop:10}}>
 <article className='panel'>
 <div className='section-header'>
 <div>
 <h3 style={{margin:0}}>{t('🌤️ 9-City Weather Forecast (Ghana • Nigeria • Burkina Faso)','🌤️ Prévisions météo de 9 villes (Ghana • Nigeria • Burkina Faso)','🌤️ 9城天气预报（加纳 • 尼日利亚 • 布基纳法索）')}</h3>
 <p style={{fontSize:'.82rem', color:'#64748b', margin:'4px 0 0'}}>{t('Country codes: GH = Ghana, NG = Nigeria, BF = Burkina Faso.','Codes pays : GH = Ghana, NG = Nigeria, BF = Burkina Faso.','国家代码：GH=加纳，NG=尼日利亚，BF=布基纳法索。')}</p>
 </div>
 <button type='button' className='btn' style={{marginLeft:'auto'}} onClick={() => setWeatherOpen(v => !v)}>{weatherOpen ? t('Hide','Masquer','隐藏') : t('Show','Afficher','显示')}</button>
 </div>
 {weatherOpen && <>
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
 </>}

 <div className='section-header' style={{marginTop:12}}>
 <div>
 <h3 style={{margin:0}}>{t('📰 Ag News + Innovation','📰 Actualités agricoles + innovation','📰 农业新闻与创新')}</h3>
 </div>
 <button type='button' className='btn' style={{marginLeft:'auto'}} onClick={() => setNewsOpen(v => !v)}>{newsOpen ? t('Hide','Masquer','隐藏') : t('Show','Afficher','显示')}</button>
 </div>
 {newsOpen && <>
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
 </>}
 </article>


 </div>

 <article className='panel' style={{marginTop:10}}>
 <div className='section-header'>
 <h3 style={{margin:0}}>{t('🏛️ Government Programs & Subsidies (Ghana • Nigeria • Burkina Faso)','🏛️ Programmes gouvernementaux & subventions (Ghana • Nigeria • Burkina Faso)','🏛️ 政府项目与补贴（加纳・尼日利亚・布基纳法索）')}</h3>
 <button type='button' className='btn' style={{marginLeft:'auto'}} onClick={() => setGovernmentProgramsOpen(v => !v)}>{governmentProgramsOpen ? t('Hide','Masquer','隐藏') : t('Show','Afficher','显示')}</button>
 </div>
 {governmentProgramsOpen && <div className='list'>
 {publicGovRows.slice(0, 6).map((g, i) => (
 <div className='list-row' key={`gov-${i}`}>
 <span>{g.country} • {g.agency} • {safeGovHeadline(g)} ({String(g.status || 'ok').toLowerCase().includes('error') ? t('unavailable','indisponible','不可用') : (g.status || 'ok')})</span>
 <a className='btn' href={g.source_url} target='_blank' rel='noreferrer'>{t('Programs Page','Page des programmes','项目页面')}</a>
 </div>
 ))}
 {false && <div className='list-row'><span>Loading official ministry programs…</span></div>}
 </div>}
 </article>

 <article className='panel' style={{marginTop:10}}>
 <div className='section-header'>
 <div>
 <h3 style={{margin:0}}>{t('🌍 Current Export/Import Statistics (Top 10 + Volumes)','🌍 Statistiques actuelles export/import (Top 10 + volumes)','🌍 当前进出口统计（前10名+总量）')}</h3>
 <p style={{fontSize:'.85rem',color:'#475569', margin:'4px 0 0'}}>{t('Select a commodity below to expand its export/import rankings.','Sélectionnez une marchandise ci-dessous pour afficher ses classements export/import.','请选择下方商品以展开查看其进出口排名。')}</p>
 </div>
 <button type='button' className='btn' style={{marginLeft:'auto'}} onClick={() => setTradeStatsOpen(v => !v)}>{tradeStatsOpen ? t('Hide','Masquer','隐藏') : t('Show','Afficher','显示')}</button>
 </div>
 {tradeStatsOpen && <>
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
 </>}
 </article>

 

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

 {publicDetail && <div className='lightbox' onClick={() => setPublicDetail(null)}>
 <div className='lightbox-inner public-detail' onClick={(e) => e.stopPropagation()}>
 <div className='list-row' style={{marginBottom:8}}>
 <strong>{publicDetail.title}</strong>
 <button type='button' className='btn btn-dark' onClick={() => setPublicDetail(null)}>Close</button>
 </div>
 <ListingGallery images={publicDetail.images} title={publicDetail.title} onOpen={(imgs, index, title) => setLightbox({ open: true, images: imgs, index, title })} />
 <div className='detail-meta' style={{marginTop:10}}>
 <div className='helper-text'>{publicDetail.subtitle}</div>
 <div className='listing-card-metrics'>{(publicDetail.stats || []).map((item) => <span key={item}>{item}</span>)}</div>
 <div className='contact-panel'>Sign in to contact this seller/provider directly.</div>
 <div className='card-actions'>
 <button type='button' className='btn btn-dark' onClick={() => handleProtectedAction(publicDetail.section, `Contact ${publicDetail.title}`)}>Contact Seller</button>
 <button type='button' className='btn' onClick={() => handleProtectedAction(publicDetail.section, `Save ${publicDetail.title}`)}>Save Listing</button>
 <button type='button' className='btn' onClick={async () => { try { await navigator.share?.({ title: publicDetail.title, text: publicDetail.subtitle, url: window.location.href }) } catch {} }}>Share</button>
 </div>
 </div>
 </div>
 </div>}
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
 {lightbox.open && <div className='lightbox' onClick={() => setLightbox({ open: false, images: [], index: 0, title: '' })}>
 <div className='lightbox-inner' onClick={(e) => e.stopPropagation()}>
 <div className='list-row' style={{marginBottom:8}}>
 <strong>{lightbox.title}</strong>
 <button type='button' className='btn btn-dark' onClick={() => setLightbox({ open: false, images: [], index: 0, title: '' })}>Close</button>
 </div>
 <img src={lightbox.images[lightbox.index]} alt={lightbox.title} className='lightbox-image' />
 {lightbox.images.length > 1 && <div className='gallery-controls' style={{position:'static', marginTop:8}}>
 <button type='button' className='btn btn-mini' onClick={() => setLightbox(prev => ({ ...prev, index: (prev.index - 1 + prev.images.length) % prev.images.length }))}>Prev</button>
 <span className='gallery-count'>{lightbox.index + 1}/{lightbox.images.length}</span>
 <button type='button' className='btn btn-mini' onClick={() => setLightbox(prev => ({ ...prev, index: (prev.index + 1) % prev.images.length }))}>Next</button>
 </div>}
 </div>
 </div>}
 {selectedOrder && <div className='lightbox' onClick={() => setSelectedOrder(null)}>
 <div className='lightbox-inner public-detail' onClick={(e) => e.stopPropagation()}>
 <div className='list-row' style={{marginBottom:8}}><strong>Order details</strong><button type='button' className='btn btn-dark' onClick={() => setSelectedOrder(null)}>Close</button></div>
 <div className='detail-meta'>
 <div className='listing-card-metrics'>
 <span>Order {selectedOrder.id}</span><span>{selectedOrder.listing_type}</span><span>{selectedOrder.escrow_status}</span>
 </div>
 <h4>{selectedOrder.listing_title}</h4>
 <div className='helper-text'>Payment {selectedOrder.payment_status} • Payout {selectedOrder.payout_status}</div>
 <div className='panel' style={{marginTop:10}}>
 <div>Gross: {selectedOrder.gross_amount} {selectedOrder.currency}</div>
 <div>Platform fee: {selectedOrder.platform_fee}</div>
 <div>Processing fee: {selectedOrder.processing_fee}</div>
 <div>Seller net: {selectedOrder.seller_net}</div>
 <div>Payment ref: {selectedOrder.payment_reference || 'Pending'}</div>
 </div>
 </div>
 </div>
 </div>}
 {selectedReceipt && <div className='lightbox' onClick={() => setSelectedReceipt(null)}>
 <div className='lightbox-inner public-detail' onClick={(e) => e.stopPropagation()}>
 <div className='list-row' style={{marginBottom:8}}><strong>Receipt / Invoice</strong><button type='button' className='btn btn-dark' onClick={() => setSelectedReceipt(null)}>Close</button></div>
 <pre className='receipt-box'>{JSON.stringify(selectedReceipt, null, 2)}</pre>
 <div className='card-actions'><button type='button' className='btn btn-dark' onClick={() => window.print()}>Print / Save PDF</button></div>
 </div>
 </div>}
 <div className='layout'>
 <aside className={`sidebar ${mobileMenuOpen ? 'open' : ''}`}>
 <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
 <img src='/assets/farmsavior-logo.jpg' alt='FarmSavior' style={{width:36,height:36,borderRadius:8,objectFit:'cover'}} />
 <h3 style={{margin:0}}>FarmSavior</h3>
 </div>
 <div className='sidebar-section-label'>Current section</div>
 {menu.map(m => <button key={m} className={`sideBtn ${active === m ? 'on' : ''}`} aria-current={active === m ? 'page' : undefined} onClick={() => { setActive(m); setMobileMenuOpen(false) }}><span>{menuLabel(m)}</span>{active === m && <span className='sideBtnMarker'>Current</span>}</button>)}
 <button className='sideBtn' onClick={() => { localStorage.removeItem('farmsavior_token'); setToken('') }}>{t('logout','se déconnecter')}</button>
 </aside>
 <main className='main'>
 <div className='mobileTopBar'>
 <button className='btn btn-dark' type='button' onClick={() => setMobileMenuOpen(v => !v)}>{mobileMenuOpen ? 'Close menu' : 'Menu'}</button>
 <div className='mobileTopBarTitle'>
 <strong>FarmSavior</strong>
 <span>{menuLabel(active)}</span>
 </div>
 <span className='notif-badge'>{state.notifications.filter(n => !n.is_read).length}</span>
 </div>
 <div className='inlineForm app-toolbar' style={{marginBottom:10, justifyContent:'space-between'}}>
 <div className='app-toolbar-main'>
 <select className='input' value={uiCountry} onChange={(e)=>setUiCountry(e.target.value)}>
 <option value='GH'>Ghana</option><option value='NG'>Nigeria</option><option value='BF'>Burkina Faso</option>
 </select>
 <select className='input' value={uiLang} onChange={(e)=>setUiLang(e.target.value)}>
 <option value='en'>English</option><option value='fr'>Français</option><option value='zh'>中文</option>
 </select>
 <div className='app-quick-nav' role='tablist' aria-label='App sections'>
 <button className={`app-quick-btn ${active === 'home' ? 'active' : ''}`} aria-pressed={active === 'home'} onClick={() => setActive('home')}>{t('← Main Interface','← Interface principale','← 主界面')}</button>
 <button className={`app-quick-btn ${active === 'products' ? 'active' : ''}`} aria-pressed={active === 'products'} onClick={() => setActive('products')}>{t('Products','Produits')}</button>
 <button className={`app-quick-btn ${active === 'livestock' ? 'active' : ''}`} aria-pressed={active === 'livestock'} onClick={() => setActive('livestock')}>{t('Livestock','Élevage')}</button>
 <button className={`app-quick-btn ${active === 'services' ? 'active' : ''}`} aria-pressed={active === 'services'} onClick={() => setActive('services')}>{t('Services','Services')}</button>
 <button className={`app-quick-btn ${active === 'ai-disease' ? 'active' : ''}`} aria-pressed={active === 'ai-disease'} onClick={() => setActive('ai-disease')}>{t('AI Disease Analyzer','Analyseur IA des maladies','AI 病害分析')}</button>
 <button className={`app-quick-btn ${active === 'poultry-university' ? 'active' : ''}`} aria-pressed={active === 'poultry-university'} onClick={() => setActive('poultry-university')}>AADU Poultry</button>
 <button className={`app-quick-btn ${active === 'sheep-university' ? 'active' : ''}`} aria-pressed={active === 'sheep-university'} onClick={() => setActive('sheep-university')}>AADU Sheep</button>
 <button className={`app-quick-btn ${active === 'goat-university' ? 'active' : ''}`} aria-pressed={active === 'goat-university'} onClick={() => setActive('goat-university')}>AADU Goat</button>
 <button className={`app-quick-btn ${active === 'cattle-university' ? 'active' : ''}`} aria-pressed={active === 'cattle-university'} onClick={() => setActive('cattle-university')}>AADU Cattle</button>
 <button className={`app-quick-btn ${active === 'livestock-records' ? 'active' : ''}`} aria-pressed={active === 'livestock-records'} onClick={() => setActive('livestock-records')}>{t('Records','Registres','档案')}</button>
 </div>
 </div>
 <div className='app-toolbar-side'>
 <button className={`app-quick-btn ${active === 'onboarding' ? 'active' : ''}`} aria-pressed={active === 'onboarding'} onClick={() => setActive('onboarding')}>{t('My Account','Mon compte')}</button>
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
 <div style={{position:'absolute',left:74,bottom:8,color:'#fff',fontWeight:700,textShadow:'0 1px 2px rgba(0,0,0,.6)'}}>{(communityProfile.full_name || me?.full_name || 'Your Community Profile') + verificationBadge(me) + (communityProfile.username ? ` • @${communityProfile.username}` : '')}</div>
 </div>

 <div className='list' style={{maxHeight:260, overflow:'auto', marginTop:26}}>
 {(communityFeedItems || []).slice(0, 4).map((item)=><div key={`home-feed-${item.id}`} className='panel' style={{padding:8}}>
 <div style={{fontWeight:700}}>{item?.actor?.full_name || item?.post?.author_full_name || `User ${item?.actor?.user_id || ''}`}{item?.actor?.username ? ` • @${item.actor.username}` : ''}</div>
 <div style={{fontSize:'.82rem', color:'#64748b'}}>{item.summary || 'Community activity'}</div>
 {item.type === 'community_post' && !!item?.post?.text && <div style={{fontSize:'.9rem'}}>{String(item.post.text).slice(0, 140)}{String(item.post.text).length > 140 ? '…' : ''}</div>}
 {item.type === 'profile_update' && <div style={{fontSize:'.88rem'}}>{item?.profile_update?.bio || item?.profile_update?.farm_life || 'Updated profile photos and bio.'}</div>}
 {String(item.type || '').includes('listing') && <div style={{fontSize:'.88rem'}}>{item?.listing?.title} • {item?.listing?.quantity || 0} {item?.listing?.unit_label || ''} {item?.listing?.location ? `• ${item.listing.location}` : ''}</div>}
 <div style={{fontSize:'.8rem', color:'#64748b'}}>{String(item.created_at || '').replace('T',' ').slice(0,16)}</div>
 </div>)}
 {!(communityFeedItems || []).length && <div className='list-row'><span>No community activity yet.</span></div>}
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
 <div className='list-row'><span>Farmer Profiles</span><strong>{(state.users || []).filter(u => (u.role||'') === 'Farmer').length}</strong></div>
 <div className='list-row'><span>Growth Signal</span><strong>{(state.users || []).length > 5 ? 'Growing' : 'Early Stage'}</strong></div>
 </article>
 </div>

 <DataTable columns={['id', 'full_name', 'phone', 'country', 'region', 'role']} rows={state.users || []} filterKey='full_name' />
 </section>}

 {active === 'onboarding' && <section className='onboarding-shell'>
 {!!paymentReturnNotice && <article className='panel' style={{marginBottom:12, background:'linear-gradient(135deg,#ecfdf5 0%,#eff6ff 100%)', border:'1px solid #86efac'}}>
 <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',alignItems:'center'}}>
 <div>
 <div style={{fontSize:'.78rem',fontWeight:800,color:'#15803d',textTransform:'uppercase',letterSpacing:'.08em'}}>Payment confirmed</div>
 <h3 style={{margin:'4px 0 6px'}}>{paymentReturnNotice.title}</h3>
 <div style={{color:'#334155'}}>{paymentReturnNotice.message}</div>
 <div className='helper-text' style={{marginTop:6}}>Reference: {paymentReturnNotice.reference} • Verified {formatDateTime(paymentReturnNotice.verified_at)}</div>
 </div>
 <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
 <button type='button' className='btn btn-dark' onClick={() => setActive(paymentReturnNotice.section || 'onboarding')}>Open access</button>
 <button type='button' className='btn' onClick={() => setPaymentReturnNotice(null)}>Dismiss</button>
 </div>
 </div>
 </article>}
 <div className='two-col' style={{marginBottom:12}}>
 <article className='panel'>
 <h3>{t('My Account','Mon compte','我的账户')}</h3>
 <form className='list' onSubmit={async e => {
 e.preventDefault()
 setActionBusy('livestock-create')
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
 <h3>Subscriptions & Billing</h3>
 <div className='list'>
 {(billingOverview.active_subscriptions || []).slice(0, 6).map((sub) => <div className='list-row' key={`active-sub-${sub.reference}`}>
   <span>
    <strong>{paymentSectionLabel(sub.product)}</strong><br/>
    <small>{String(sub.plan_code || '').toUpperCase()} plan • {String(sub.billing_cycle || '').toLowerCase()} billing</small>
   </span>
   <strong>{sub.status}</strong>
  </div>)}
 {!(billingOverview.active_subscriptions || []).length && <div className='list-row'><span>No active paid subscriptions yet.</span></div>}
 </div>
 <div className='panel' style={{marginTop:10, padding:10, background:'#f8fafc'}}>
 <strong style={{display:'block', marginBottom:6}}>Billing history</strong>
 <div className='list' style={{maxHeight:220, overflow:'auto'}}>
 {[...(billingOverview.subscriptions || []).map((sub) => ({
   kind: 'subscription',
   reference: sub.reference,
   title: paymentSectionLabel(sub.product),
   subtitle: `${String(sub.plan_code || '').toUpperCase()} plan • ${String(sub.billing_cycle || '').toLowerCase()} billing`,
   status: sub.status,
   amount: formatMoney(sub.amount, sub.currency),
   when: sub.created_at || sub.started_at
  })), ...(billingOverview.payments || []).map((pay) => ({
   kind: 'payment',
   reference: pay.reference,
   title: paymentSectionLabel(pay.product || ''),
   subtitle: `${pay.method || 'Payment'} • ${pay.provider || 'FarmSavior'}`,
   status: pay.status,
   amount: formatMoney(pay.amount, pay.currency),
   when: pay.created_at
  }))].sort((a,b) => new Date(b.when || 0) - new Date(a.when || 0)).slice(0, 12).map((row) => <div className='list-row' key={`${row.kind}-${row.reference}`}>
   <span>
    <strong>{row.title || 'Payment'}</strong><br/>
    <small>{row.subtitle}{row.when ? ` • ${formatDateTime(row.when)}` : ''}{row.reference ? ` • Ref: ${row.reference}` : ''}</small>
   </span>
   <strong>{row.amount} • {row.status}</strong>
  </div>)}
 {!((billingOverview.subscriptions || []).length || (billingOverview.payments || []).length) && <div className='list-row'><span>No billing history yet.</span></div>}
 </div>
 </div>
 </article>

 <article className='panel'>
 <h3>{t('My Verification Status','Mon statut de vérification','我的认证状态')}</h3>
 <div className='list'>
 <div className='list-row'><span>Current status</span><strong>{verificationStatusLabel(me?.identity_verification_status || myIdVerification?.review?.status || 'NOT_SUBMITTED')}{verificationBadge(me)}</strong></div>
 <div className='list-row'><span>ID type</span><strong>{myIdVerification?.application?.id_type || '-'}</strong></div>
 <div className='list-row'><span>Submitted at</span><strong>{String(myIdVerification?.application?.created_at || myIdVerification?.application?.submitted_at || '-').slice(0, 16)}</strong></div>
 {myIdVerification?.review?.reviewed_at ? <div className='list-row'><span>Reviewed at</span><strong>{String(myIdVerification.review.reviewed_at).slice(0, 16)}</strong></div> : null}
 {myIdVerification?.review?.reviewer_note ? <div className='helper-text' style={{marginTop:8}}>Latest reviewer note: {myIdVerification.review.reviewer_note}</div> : null}
 </div>
 <form className='list' onSubmit={async e => {
 e.preventDefault()
 if (!myIdForm.id_front_photo_url || !myIdForm.id_back_photo_url) { alert('Please upload front and back ID photos from your device or camera.'); return }
 try {
 await api.submitMyIdVerification({ ...myIdForm, facial_verification_flag: false })
 alert('Verification update submitted. Status set to Pending verification for re-review.')
 await load()
 } catch (e) { alert(errMsg(e)) }
 }}>
 <select className='input' value={myIdForm.id_type} onChange={e => setMyIdForm({ ...myIdForm, id_type: e.target.value })}><option>GhanaCard</option><option>NIN</option><option>BF National ID</option></select>
 <input className='input' placeholder='ID Number (e.g. GHA-123456789-0)' value={myIdForm.id_number} onChange={e => setMyIdForm({ ...myIdForm, id_number: e.target.value.toUpperCase() })} />
 <div className='helper-text'>For Ghana Card, use the PIN format shown on the card. Front and back images are required.</div>
 <label className='upload-field'><span className='helper-text'>Upload ID Front</span>
 <input className='input' type='file' accept='image/*' onChange={(e) => {
 const f = e.target.files?.[0]; if (!f) return
 const r = new FileReader(); r.onload = () => setMyIdForm(prev => ({ ...prev, id_front_photo_url: String(r.result || ''), id_photo_url: String(r.result || '') })); r.readAsDataURL(f)
 }} />
 </label>
 <label className='upload-field'><span className='helper-text'>Upload ID Back</span>
 <input className='input' type='file' accept='image/*' onChange={(e) => {
 const f = e.target.files?.[0]; if (!f) return
 const r = new FileReader(); r.onload = () => setMyIdForm(prev => ({ ...prev, id_back_photo_url: String(r.result || '') })); r.readAsDataURL(f)
 }} />
 </label>
 <button className='btn btn-dark'>Submit Verification Update</button>
 </form>
 <div style={{fontSize:'.78rem',color:'#64748b',marginTop:6}}>If you update ID details after approval, your verification goes through re-review for safety.</div>
 </article>
 </div>

 <div className='two-col onboarding-grid'>
 {((me?.role || '').toLowerCase() === 'admin') && <article className='panel onboarding-panel'><div className='onboarding-panel-head'><h3>{t('ID Verification','Vérification d’identité','身份认证')}</h3><p className='helper-text'>Admin-only manual verification form.</p></div><form className='list onboarding-form' onSubmit={async e => { e.preventDefault(); if (!idForm.id_front_photo_url || !idForm.id_back_photo_url) { alert('Please upload front and back ID photos from your device or camera.'); return } await api.createIdVerification({ ...idForm, user_id: Number(idForm.user_id), facial_verification_flag: false }); await load() }}>
 <input className='input' type='number' placeholder='User ID' value={idForm.user_id} onChange={e => setIdForm({ ...idForm, user_id: e.target.value })} />
 <select className='input' value={idForm.id_type} onChange={e => setIdForm({ ...idForm, id_type: e.target.value })}><option>GhanaCard</option><option>NIN</option><option>BF National ID</option></select>
 <input className='input' placeholder='ID Number (e.g. GHA-123456789-0)' value={idForm.id_number} onChange={e => setIdForm({ ...idForm, id_number: e.target.value.toUpperCase() })} />
 <div className='helper-text'>Ghana Card reviews are fastest when the PIN matches card format and both sides are uploaded clearly.</div>
 <label className='upload-field'><span className='helper-text'>Upload ID Front</span>
 <input className='input' type='file' accept='image/*' onChange={(e) => {
 const f = e.target.files?.[0]; if (!f) return
 const r = new FileReader(); r.onload = () => setIdForm(prev => ({ ...prev, id_front_photo_url: String(r.result || ''), id_photo_url: String(r.result || '') })); r.readAsDataURL(f)
 }} />
 </label>
 <label className='upload-field'><span className='helper-text'>Upload ID Back</span>
 <input className='input' type='file' accept='image/*' onChange={(e) => {
 const f = e.target.files?.[0]; if (!f) return
 const r = new FileReader(); r.onload = () => setIdForm(prev => ({ ...prev, id_back_photo_url: String(r.result || '') })); r.readAsDataURL(f)
 }} />
 </label>
 <button className='btn btn-dark'>Save ID Verification</button>
 </form></article>}
 </div>

 {((me?.role || '').toLowerCase() === 'admin') && <article className='panel' style={{marginTop: 12}}>
 <div className='panelHeadActions'>
 <div>
 <h3>{t('Verification Applications','Demandes de vérification','认证申请')}</h3>
 <div className='helper-text'>Ghana Card queue with fast-pass recommendations. Human approval is still required before the badge turns on.</div>
 </div>
 <button className='btn btn-dark' onClick={async () => { await api.analyzeAllVerifications(); await load(); }}>Run Ghana Card Analysis</button>
 </div>
 <DataTable columns={['id_verification_id','full_name','phone','country','id_type','status','ai_score','ai_reason']} rows={state.verificationApps} filterKey='full_name' />
 <div className='list' style={{marginTop:12}}>{state.verificationApps.slice().sort((a, b) => {
 const rank = { FAST_PASS: 0, HIGH: 1, NORMAL: 2 }
 return (rank[a?.assessment?.review_priority] ?? 9) - (rank[b?.assessment?.review_priority] ?? 9) || Number(b.id_verification_id || 0) - Number(a.id_verification_id || 0)
 }).slice(0, 16).map((app) => {
 const assessment = app.assessment || {}
 const reasons = [...(assessment.hard_failures || []), ...(assessment.warnings || [])].slice(0, 3)
 const quickApproveNote = assessment.recommendation === 'FAST_PASS_RECOMMENDED'
 ? `Fast-pass approved after reviewer confirmed Ghana Card front/back images and PIN ${assessment?.extracted?.id_number_normalized || app.id_number || ''}.`
 : `Approved after manual document review for ${app.id_type || 'ID submission'}.`
 const quickDenyNote = `Denied after Ghana Card review: ${reasons.join('; ') || 'document did not meet verification requirements.'}`
 return <div key={`verify-preview-${app.id_verification_id}`} className='panel' style={{padding:12, border:assessment.recommendation === 'FAST_PASS_RECOMMENDED' ? '1px solid #16a34a' : assessment.recommendation === 'AUTO_REJECT' ? '1px solid #dc2626' : '1px solid #e2e8f0', background:assessment.recommendation === 'FAST_PASS_RECOMMENDED' ? '#f0fdf4' : assessment.recommendation === 'AUTO_REJECT' ? '#fef2f2' : '#fff'}}>
 <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start',flexWrap:'wrap'}}>
 <div>
 <div style={{fontWeight:700, marginBottom:4}}>{app.full_name} — {verificationStatusLabel(app.status)}{app.status === 'APPROVED' ? ' 🔵' : ''}</div>
 <div className='helper-text'>Application #{app.id_verification_id} • {app.id_type} • {assessment.extracted?.id_number_normalized || app.id_number || 'No ID number'}</div>
 <div style={{marginTop:6, fontSize:'.85rem'}}><strong>{assessment.summary || app.ai_reason}</strong></div>
 {assessment.recommendation ? <div style={{marginTop:6, fontSize:'.82rem', color:assessment.recommendation === 'FAST_PASS_RECOMMENDED' ? '#166534' : assessment.recommendation === 'AUTO_REJECT' ? '#991b1b' : '#475569'}}>Recommendation: {String(assessment.recommendation || '').replaceAll('_', ' ')}</div> : null}
 {reasons.length ? <div style={{marginTop:6}}>{reasons.map((reason, idx) => <div key={`${app.id_verification_id}-reason-${idx}`} className='helper-text'>• {reason}</div>)}</div> : null}
 {app.reviewer_note ? <div className='helper-text' style={{marginTop:6}}>Reviewer note: {app.reviewer_note}</div> : null}
 </div>
 <div style={{textAlign:'right', minWidth:150}}>
 <div style={{fontSize:'.8rem', color:'#64748b'}}>AI score</div>
 <div style={{fontWeight:800, fontSize:'1.1rem'}}>{Math.round(Number(app.ai_score || 0) * 100)}%</div>
 <div className='helper-text'>{assessment.review_priority || 'NORMAL'}</div>
 </div>
 </div>
 <div className='row2' style={{gap:10, marginTop:10}}>{app.id_front_photo_view_url ? <a className='btn' href={api.withAuthToken(app.id_front_photo_view_url)} target='_blank' rel='noreferrer'>View ID Front</a> : <span className='helper-text'>No front image</span>}{app.id_back_photo_view_url ? <a className='btn' href={api.withAuthToken(app.id_back_photo_view_url)} target='_blank' rel='noreferrer'>View ID Back</a> : <span className='helper-text'>No back image</span>}<button className='btn' onClick={async ()=>{ await api.analyzeVerification(app.id_verification_id); await load(); }}>Analyze</button><button className='btn btn-dark' onClick={async ()=>{ await api.setVerificationDecision(app.id_verification_id,{status:'APPROVED', reviewer_note:quickApproveNote}); await load(); }}>Approve + badge</button><button className='btn' onClick={async ()=>{ await api.setVerificationDecision(app.id_verification_id,{status:'DENIED', reviewer_note:quickDenyNote}); await load(); }}>Deny with reason</button></div>
 </div>
 })}</div>
 </article>}

 {((me?.role || '').toLowerCase() === 'admin') && <article className='panel' style={{marginTop: 12}}>
 <h3>{t('Verified Accounts (Approved)','Comptes vérifiés (approuvés)','已认证账户（已批准）')}</h3>
 <DataTable columns={['user_id','full_name','phone','country','role','verified_status','ai_score']} rows={state.approvedAccounts} filterKey='full_name' />
 </article>}
 </section>}

 {active === 'products' && <section>
 <div className='section-header'>
 <div>
 <h3>{t('Product Listings','Annonces de produits','产品列表')}</h3>
 <p className='helper-text'>Create, manage, and add up to 20 images for each product listing.</p>
 </div>
 <button className='btn btn-dark' type='button' onClick={() => setProductsView('create')}>Add New Product</button>
 </div>
 <div className='tabs compact-tabs'>
 <button className={`tab ${productsView === 'list' ? 'active' : ''}`} onClick={() => setProductsView('list')}>Product List</button>
 <button className={`tab ${productsView === 'create' ? 'active' : ''}`} onClick={() => setProductsView('create')}>Create Product</button>
 <button className={`tab ${productsView === 'edit' ? 'active' : ''}`} onClick={() => setProductsView('edit')} disabled={!cropEdit.id}>Edit Product</button>
 </div>

 {productsView === 'create' && <article className='panel'>
 <form className='list' onSubmit={async e => {
 e.preventDefault();
 await api.createListing({ ...cropForm, ...normalizeListingImages(productImages), farmer_id: Number(cropForm.farmer_id), quantity_kg: Number(cropForm.quantity_kg), unit_price: Number(cropForm.unit_price) });
 setProductImages([])
 await load();
 setProductsView('list')
 }}>
 <div className='row2' style={{gap:10}}>
 <input className='input' placeholder='Product name' value={cropForm.crop_name} onChange={e => setCropForm({ ...cropForm, crop_name: e.target.value })} required />
 <input className='input' placeholder='Location' value={cropForm.location} onChange={e => setCropForm({ ...cropForm, location: e.target.value })} />
 </div>
 <div className='row2' style={{gap:10}}>
 <input className='input' placeholder='Qty kg' value={cropForm.quantity_kg} onChange={e => setCropForm({ ...cropForm, quantity_kg: e.target.value })} required />
 <input className='input' placeholder='Unit price' value={cropForm.unit_price} onChange={e => setCropForm({ ...cropForm, unit_price: e.target.value })} required />
 </div>
 <ListingImagePicker label='Product photos' limit={MAX_IMAGE_COUNTS.products} images={productImages} setImages={setProductImages} />
 <button className='btn btn-dark'>Create Product</button>
 </form>
 </article>}

 {productsView === 'edit' && <article className='panel'>
 {!cropEdit.id ? <EmptyListingsState title='Choose a product to edit' body='Open Product List and tap Edit on a product card or row.' /> : <form className='list' onSubmit={async e => {
 e.preventDefault();
 await api.updateListing(Number(cropEdit.id), { ...cropEdit, ...normalizeListingImages(productEditImages, productEditImages[0]), farmer_id: Number(cropEdit.farmer_id), quantity_kg: Number(cropEdit.quantity_kg), unit_price: Number(cropEdit.unit_price) });
 await load();
 setProductsView('list')
 }}>
 <div className='row2' style={{gap:10}}>
 <input className='input' placeholder='Listing ID' value={cropEdit.id} onChange={e => setCropEdit({ ...cropEdit, id: e.target.value })} required />
 <input className='input' placeholder='Product name' value={cropEdit.crop_name} onChange={e => setCropEdit({ ...cropEdit, crop_name: e.target.value })} required />
 </div>
 <div className='row2' style={{gap:10}}>
 <input className='input' placeholder='Qty kg' value={cropEdit.quantity_kg} onChange={e => setCropEdit({ ...cropEdit, quantity_kg: e.target.value })} required />
 <input className='input' placeholder='Unit price' value={cropEdit.unit_price} onChange={e => setCropEdit({ ...cropEdit, unit_price: e.target.value })} required />
 </div>
 <input className='input' placeholder='Location' value={cropEdit.location} onChange={e => setCropEdit({ ...cropEdit, location: e.target.value })} />
 <ListingImagePicker label='Product photos' limit={MAX_IMAGE_COUNTS.products} images={productEditImages} setImages={setProductEditImages} />
 <button className='btn btn-dark'>Save Product Changes</button>
 </form>}
 </article>}

 {productsView === 'list' && <article className='panel'>
 {!state.listings.length ? <EmptyListingsState title='No products listed yet' body='Add your first product with price, quantity, location, and photos.' actionLabel='Add First Product' onAction={() => setProductsView('create')} /> : <>
 <div className='card-grid'>
 {state.listings.map((r) => {
 const images = parseImageList(r.image_urls)
 return <ListingDetailCard key={`product-card-${r.id}`} title={r.crop_name} subtitle={`${r.location || 'Location not set'} • ${r.country} • ${r.status}`} stats={[`${r.quantity_kg} kg`, `${r.unit_price}`, `${images.length} photos`]} contact={r.contact_name || r.phone || `Farmer #${r.farmer_id || '—'}`}><div className='listing-card-media'><ListingGallery images={images.length ? images : [r.cover_image_url].filter(Boolean)} title={r.crop_name} onOpen={(imgs, index, title) => setLightbox({ open: true, images: imgs, index, title })} /></div><div className='listing-card-body'><div className='listing-card-metrics'>{images.length ? <span className='cover-badge'>Cover ready</span> : null}</div><div className='card-actions'>
 <button className='btn btn-dark' type='button' onClick={() => {
 setCropEdit({ id: r.id, farmer_id: r.farmer_id || 1, crop_name: r.crop_name || '', quantity_kg: r.quantity_kg || '', unit_price: r.unit_price || '', location: r.location || '', country: r.country || 'GH', status: r.status || 'OPEN' })
 setCropQuickEdit({ id: r.id, quantity_kg: r.quantity_kg || '', unit_price: r.unit_price || '' })
 setProductEditImages(images)
 setProductsView('edit')
 }}>Edit</button>
 <button className='btn' type='button' onClick={() => setSavedListings(prev => isSavedListing(prev, 'product', r.id) ? prev.filter(x => x !== listingKey('product', r.id)) : [...prev, listingKey('product', r.id)])}>{isSavedListing(savedListings, 'product', r.id) ? 'Saved ✓' : 'Save'}</button><button className='btn' type='button' onClick={async () => { try { await navigator.share?.({ title: r.crop_name, text: `${r.location || ''} • ${r.quantity_kg} kg`, url: window.location.href }) } catch {} }}>Share</button><button className='btn' type='button' onClick={() => openOrderFromListing({ me, setActive, setOrderForm, listingType: 'PRODUCT', listingId: r.id, listingTitle: r.crop_name, sellerId: r.farmer_id, unitPrice: r.unit_price, quantity: 1 })}>Contact via FarmSavior</button><button className='btn' type='button' onClick={() => openOrderFromListing({ me, setActive, setOrderForm, listingType: 'PRODUCT', listingId: r.id, listingTitle: r.crop_name, sellerId: r.farmer_id, unitPrice: r.unit_price, quantity: 1 })}>Make Offer</button><button className='btn' type='button' onClick={() => openOrderFromListing({ me, setActive, setOrderForm, listingType: 'PRODUCT', listingId: r.id, listingTitle: r.crop_name, sellerId: r.farmer_id, unitPrice: r.unit_price, quantity: 1 })}>Request Purchase</button><button className='btn' type='button' onClick={async () => { if (!window.confirm(`Delete product #${r.id}?`)) return; await api.deleteListing(r.id); await load() }}>Delete</button>
 </div>
 </div>
 </ListingDetailCard>
 })}
 </div>
 <DataTable columns={['id', 'crop_name', 'quantity_kg', 'unit_price', 'country', 'status']} rows={state.listings} filterKey='crop_name' onEdit={(r) => {
 setCropEdit({ id: r.id, farmer_id: r.farmer_id || 1, crop_name: r.crop_name || '', quantity_kg: r.quantity_kg || '', unit_price: r.unit_price || '', location: r.location || '', country: r.country || 'GH', status: r.status || 'OPEN' })
 setCropQuickEdit({ id: r.id, quantity_kg: r.quantity_kg || '', unit_price: r.unit_price || '' })
 setProductEditImages(parseImageList(r.image_urls))
 setProductsView('edit')
 }} />
 </>}
 </article>}
 </section>}

 {active === 'livestock' && <section>
 <div className='section-header'>
 <div>
 <h3>{t('Livestock Listings','Annonces de bétail','牲畜列表')}</h3>
 <p className='helper-text'>Create, manage, and add up to 10 images for each livestock listing.</p>
 </div>
 <button className='btn btn-dark' type='button' onClick={() => setLivestockView('create')}>Add New Livestock</button>
 </div>
 <div className='tabs compact-tabs'>
 <button className={`tab ${livestockView === 'list' ? 'active' : ''}`} onClick={() => setLivestockView('list')}>Livestock List</button>
 <button className={`tab ${livestockView === 'create' ? 'active' : ''}`} onClick={() => setLivestockView('create')}>Create Listing</button>
 <button className={`tab ${livestockView === 'edit' ? 'active' : ''}`} onClick={() => setLivestockView('edit')} disabled={!livestockEdit.id}>Edit Listing</button>
 </div>

 {livestockView === 'create' && <article className='panel'>
 <form className='list' onSubmit={async e => {
 e.preventDefault();
 await api.createLivestock({ ...livestockForm, ...normalizeListingImages(livestockImages), farmer_id: Number(livestockForm.farmer_id), quantity: Number(livestockForm.quantity), unit_price: Number(livestockForm.unit_price) });
 setLivestockImages([])
 await load();
 setLivestockView('list')
 }}>
 <div className='row2' style={{gap:10}}>
 <input className='input' placeholder='Livestock type' value={livestockForm.livestock_type} onChange={e => setLivestockForm({ ...livestockForm, livestock_type: e.target.value })} required />
 <input className='input' placeholder='Location' value={livestockForm.location} onChange={e => setLivestockForm({ ...livestockForm, location: e.target.value })} />
 </div>
 <div className='row2' style={{gap:10}}>
 <input className='input' placeholder='Quantity' value={livestockForm.quantity} onChange={e => setLivestockForm({ ...livestockForm, quantity: e.target.value })} required />
 <input className='input' placeholder='Unit price' value={livestockForm.unit_price} onChange={e => setLivestockForm({ ...livestockForm, unit_price: e.target.value })} required />
 </div>
 <ListingImagePicker label='Livestock photos' limit={MAX_IMAGE_COUNTS.livestock} images={livestockImages} setImages={setLivestockImages} />
 <button className='btn btn-dark'>Create Livestock Listing</button>
 </form>
 </article>}

 {livestockView === 'edit' && <article className='panel'>
 {!livestockEdit.id ? <EmptyListingsState title='Choose a livestock listing to edit' body='Open Livestock List and tap Edit on a listing.' /> : <form className='list' onSubmit={async e => {
 e.preventDefault();
 await api.updateLivestock(Number(livestockEdit.id), { ...livestockEdit, ...normalizeListingImages(livestockEditImages), farmer_id: Number(livestockEdit.farmer_id || 1), quantity: Number(livestockEdit.quantity), unit_price: Number(livestockEdit.unit_price) });
 await load();
 setLivestockView('list')
 }}>
 <div className='row2' style={{gap:10}}>
 <input className='input' placeholder='Listing ID' value={livestockEdit.id} onChange={e => setLivestockEdit({ ...livestockEdit, id: e.target.value })} required />
 <input className='input' placeholder='Type' value={livestockEdit.livestock_type} onChange={e => setLivestockEdit({ ...livestockEdit, livestock_type: e.target.value })} required />
 </div>
 <div className='row2' style={{gap:10}}>
 <input className='input' placeholder='Quantity' value={livestockEdit.quantity} onChange={e => setLivestockEdit({ ...livestockEdit, quantity: e.target.value })} required />
 <input className='input' placeholder='Unit price' value={livestockEdit.unit_price} onChange={e => setLivestockEdit({ ...livestockEdit, unit_price: e.target.value })} required />
 </div>
 <input className='input' placeholder='Location' value={livestockEdit.location} onChange={e => setLivestockEdit({ ...livestockEdit, location: e.target.value })} />
 <ListingImagePicker label='Livestock photos' limit={MAX_IMAGE_COUNTS.livestock} images={livestockEditImages} setImages={setLivestockEditImages} />
 <button className='btn btn-dark'>Save Livestock Changes</button>
 </form>}
 </article>}

 {livestockView === 'list' && <article className='panel'>
 {!state.livestock.length ? <EmptyListingsState title='No livestock listings yet' body='Add your first livestock listing with price, quantity, location, and photos.' actionLabel='Add First Livestock' onAction={() => setLivestockView('create')} /> : <>
 <div className='card-grid'>
 {state.livestock.map((r) => {
 const images = parseImageList(r.image_urls)
 return <ListingDetailCard key={`livestock-card-${r.id}`} title={r.livestock_type} subtitle={`${r.location || 'Location not set'} • ${r.country} • ${r.status}`} stats={[`${r.quantity} animals`, `${r.unit_price}`, `${images.length} photos`]} contact={r.contact_name || r.phone || `Farmer #${r.farmer_id || '—'}`}><div className='listing-card-media'><ListingGallery images={images.length ? images : [r.cover_image_url].filter(Boolean)} title={r.livestock_type} onOpen={(imgs, index, title) => setLightbox({ open: true, images: imgs, index, title })} /></div><div className='listing-card-body'><div className='listing-card-metrics'>{images.length ? <span className='cover-badge'>Cover ready</span> : null}</div><div className='card-actions'>
 <button className='btn btn-dark' type='button' onClick={() => {
 setLivestockEdit({ id: r.id, farmer_id: r.farmer_id || 1, livestock_type: r.livestock_type || '', quantity: r.quantity || '', unit_price: r.unit_price || '', location: r.location || '', country: r.country || 'GH', status: r.status || 'OPEN' })
 setLivestockQuickEdit({ id: r.id, quantity: r.quantity || '', unit_price: r.unit_price || '' })
 setLivestockEditImages(images)
 setLivestockView('edit')
 }}>Edit</button>
 <button className='btn' type='button' onClick={() => setSavedListings(prev => isSavedListing(prev, 'product', r.id) ? prev.filter(x => x !== listingKey('product', r.id)) : [...prev, listingKey('product', r.id)])}>{isSavedListing(savedListings, 'product', r.id) ? 'Saved ✓' : 'Save'}</button><button className='btn' type='button' onClick={async () => { try { await navigator.share?.({ title: r.crop_name, text: `${r.location || ''} • ${r.quantity_kg} kg`, url: window.location.href }) } catch {} }}>Share</button><button className='btn' type='button' onClick={() => openOrderFromListing({ me, setActive, setOrderForm, listingType: 'PRODUCT', listingId: r.id, listingTitle: r.crop_name, sellerId: r.farmer_id, unitPrice: r.unit_price, quantity: 1 })}>Contact via FarmSavior</button><button className='btn' type='button' onClick={() => openOrderFromListing({ me, setActive, setOrderForm, listingType: 'PRODUCT', listingId: r.id, listingTitle: r.crop_name, sellerId: r.farmer_id, unitPrice: r.unit_price, quantity: 1 })}>Make Offer</button><button className='btn' type='button' onClick={() => openOrderFromListing({ me, setActive, setOrderForm, listingType: 'PRODUCT', listingId: r.id, listingTitle: r.crop_name, sellerId: r.farmer_id, unitPrice: r.unit_price, quantity: 1 })}>Request Purchase</button><button className='btn' type='button' onClick={async () => { if (!window.confirm(`Delete product #${r.id}?`)) return; await api.deleteListing(r.id); await load() }}>Delete</button>
 </div>
 </div>
 </ListingDetailCard>
 })}
 </div>
 <DataTable columns={['id', 'livestock_type', 'quantity', 'unit_price', 'country', 'status']} rows={state.livestock} filterKey='livestock_type' onEdit={(r) => {
 setLivestockEdit({ id: r.id, farmer_id: r.farmer_id || 1, livestock_type: r.livestock_type || '', quantity: r.quantity || '', unit_price: r.unit_price || '', location: r.location || '', country: r.country || 'GH', status: r.status || 'OPEN' })
 setLivestockQuickEdit({ id: r.id, quantity: r.quantity || '', unit_price: r.unit_price || '' })
 setLivestockEditImages(parseImageList(r.image_urls))
 setLivestockView('edit')
 }} />
 </>}
 </article>}
 </section>}

 {active === 'poultry-university' && <section>
 <h3>🐔 Poultry University</h3>
 <div className='panel' style={{marginBottom:10, background:'linear-gradient(135deg,#eff6ff 0%,#f8fafc 100%)', border:'1px solid #bfdbfe'}}>
 <div style={{fontSize:'.76rem',fontWeight:800,letterSpacing:'.08em',textTransform:'uppercase',color:'#1d4ed8'}}>AADU school</div>
 <strong style={{display:'block',marginTop:4}}>Poultry University</strong>
 <div style={{marginTop:6,color:'#334155'}}>This school brings brooding, grow-out, layer management, biosecurity, flock health, and commercial discipline into one structured operating reference for serious poultry teams.</div>
 </div>
 <article className='panel' style={{marginBottom:10}}>
 <h4 style={{marginTop:0}}>Access & Delivery Format</h4>
 <p style={{fontSize:'.85rem',color:'#475569'}}>Standalone professional purchase also available (₵200–₵1,000 depending on package depth).</p>
 <div className='three-col'>
 <div className='panel' style={{padding:10, border:poultryTier==='free' || poultryPlanPreview==='free'?'2px solid #64748b':'1px solid #e2e8f0', cursor:'pointer'}} onClick={()=>setPoultryPlanPreview('free')}>
 <strong>🆓 Preview Access</strong>
 <div style={{fontSize:'.85rem',color:'#475569',margin:'6px 0'}}>Program overview, breed strategy, KPIs, and opening pillar.</div>
 <button className='btn' onClick={(e)=>{ e.stopPropagation(); setPoultryTier('free'); setOpenPoultryModule(0); setPoultryPlanPreview('free'); api.trackAnalyticsEvent({ event_name:'poultry_tier_select', country: uiCountry, role_hint: me?.role || 'user', properties:{tier:'free'} }).catch(()=>{})}}>{poultryTier==='free' ? 'Preview Active ✓' : 'Use Preview'}</button>
 </div>
 <div className='panel' style={{padding:10, border:poultryTier==='basic' || poultryPlanPreview==='basic'?'2px solid #16a34a':'1px solid #e2e8f0', cursor:'pointer'}} onClick={()=>setPoultryPlanPreview('basic')}>
 <strong>🌿 Basic — ₵50/mo</strong>
 <div style={{fontSize:'.85rem',color:'#475569',margin:'6px 0'}}>Full pillar access, both operating zones, health schedules, and structured implementation guidance.</div>
 <button className={`btn ${hasActiveUniversityAccess('poultry') ? '' : 'btn-dark'}`} onClick={(e)=>{ e.stopPropagation(); if (hasActiveUniversityAccess('poultry')) { showAlreadyActiveMessage('poultry'); openUniversityProduct('poultry'); return } startUniversityCheckout('poultry', 'basic', 'Poultry University Basic checkout') }}>{hasActiveUniversityAccess('poultry') ? 'Access active ✓' : 'Buy Basic'}</button>
 </div>
 <div className='panel' style={{padding:10, border:poultryTier==='pro' || poultryPlanPreview==='pro'?'2px solid #f59e0b':'1px solid #e2e8f0', cursor:'pointer'}} onClick={()=>setPoultryPlanPreview('pro')}>
 <strong>🏆 Professional — ₵120/mo</strong>
 <div style={{fontSize:'.85rem',color:'#475569',margin:'6px 0'}}>Everything in Standard plus operating briefs, benchmark scorecards, printable tools, progress tracking, and certificate outputs.</div>
 <button className={`btn ${hasActiveUniversityAccess('poultry') ? '' : 'btn-dark'}`} onClick={(e)=>{ e.stopPropagation(); if (hasActiveUniversityAccess('poultry')) { showAlreadyActiveMessage('poultry'); openUniversityProduct('poultry'); return } startUniversityCheckout('poultry', 'pro', 'Poultry University Professional checkout') }}>{hasActiveUniversityAccess('poultry') ? 'Professional access active ✓' : 'Buy Professional'}</button>
 </div>
 </div>
 <div className='panel' style={{marginTop:8,padding:8,background:'#fff7ed',border:'1px solid #fed7aa'}}>
 <strong>{universityPlanPreview[poultryPlanPreview].title} includes:</strong>
 <div className='list' style={{marginTop:6}}>
 {universityPlanPreview[poultryPlanPreview].features.map((feature)=><div className='list-row' key={feature}><span>{feature}</span></div>)}
 </div>
 {poultryPlanPreview !== 'free' && <div style={{marginTop:8}}><button className={`btn ${hasActiveUniversityAccess('poultry') ? '' : 'btn-dark'}`} onClick={()=>{ if (hasActiveUniversityAccess('poultry')) { showAlreadyActiveMessage('poultry'); openUniversityProduct('poultry'); return } startUniversityCheckout('poultry', poultryPlanPreview, `Poultry University ${poultryPlanPreview === 'pro' ? 'Professional' : 'Basic'} checkout`) }}>{hasActiveUniversityAccess('poultry') ? 'Access active ✓' : (poultryPlanPreview === 'pro' ? 'Upgrade to Professional' : 'Upgrade to Basic')}</button></div>}
 </div>
 {poultryTier === 'free' && <div className='panel' style={{marginTop:8,padding:8,background:'#fff7ed',border:'1px solid #fed7aa'}}><strong>Preview access active.</strong> This tier shows the opening pillar while the full operating framework remains under the paid plan.</div>}
 {poultrySubscription?.subscription?.status === 'PENDING_PAYMENT' && <div className='panel' style={{marginTop:8,padding:8,background:'#eff6ff',border:'1px solid #bfdbfe'}}><strong>Payment pending.</strong> Reference: {poultrySubscription.subscription.reference}. <button className='btn btn-dark' style={{marginLeft:8}} onClick={async()=>{ const v = await api.verifyPoultryUniversitySubscription(poultrySubscription.subscription.reference); const tier = v.tier || 'free'; setPoultryTier(tier); const meSub = await api.fetchPoultryUniversitySubscriptionMe().catch(()=>({ tier, subscription: poultrySubscription.subscription })); setPoultrySubscription(prev => ({ ...prev, tier: meSub.tier || tier, subscription: meSub.subscription || prev.subscription })); setPoultryBillingMsg(v.message || 'Verification checked.'); }}>Verify Payment</button></div>}
 {poultrySubscription?.subscription?.status === 'ACTIVE' && <div className='panel' style={{marginTop:8,padding:8,background:'#ecfeff',border:'1px solid #99f6e4'}}><strong>{String(poultrySubscription.subscription.plan_code || '').toUpperCase()} active.</strong> Server-side subscription verified.</div>}
 {poultryBillingMsg && <div className='panel' style={{marginTop:8,padding:8,background:'#eff6ff',border:'1px solid #bfdbfe'}}>{poultryBillingMsg}</div>}
 </article>
 {poultryTier === 'free' && <div className='panel' style={{marginTop:8,padding:8,background:'#f5f3ff',border:'1px solid #ddd6fe'}}><strong>Preview access active.</strong> The opening pillar is available now; the full operating program unlocks with the higher plan.</div>}

 <div className='panel'>
 <div className='inlineForm'>
 <select className='input' value={poultryTrack} onChange={(e)=>setPoultryTrack(e.target.value)}>
 <option value='layers'>Layers</option>
 <option value='broilers'>Broilers</option>
 <option value='guinea'>Guinea Fowl</option>
 </select>
 <select className='input' value={poultryZone} onChange={(e)=>setPoultryZone(e.target.value)}>
 <option value='humid'>Humid / Forest Zone</option>
 <option value='dry'>Dry / Savanna Zone</option>
 </select>
 </div>
 <h4 style={{marginBottom:4}}>{poultryTracks[poultryTrack].title}</h4>
 <p style={{marginTop:0,color:'#334155'}}>{poultryTracks[poultryTrack].objective}</p>
 </div>

 <div className='two-col'>
 <article className='panel'>
 <h4>Breed Intelligence</h4>
 <div className='list'>
 {poultryTracks[poultryTrack].breeds.map((b)=><div className='list-row' key={b}><span>{b}</span></div>)}
 </div>
 <h4 style={{marginTop:10}}>Target KPIs</h4>
 <div className='list'>
 {poultryTracks[poultryTrack].kpis.map((k)=><div className='list-row' key={k}><strong>{k}</strong></div>)}
 </div>
 </article>

 <article className='panel'>
 <h4>Program Pillars</h4>
 <div className='list'>
 {poultryTracks[poultryTrack].modules.map((m,i)=>{
 const locked = poultryTier === 'free' && i > 0
 return <div key={m.name} className='panel' style={{padding:8,border:locked?'1px solid #e2e8f0':'1px solid #dbe6df',opacity:locked?0.6:1,background:locked?'#f8fafc':'#fff'}}>
 <div className='list-row'>
 <span><strong>{m.name}</strong><br/><span style={{fontSize:'.85rem',color:'#475569'}}>{m.summary}</span></span>
 {locked ? <button className='btn' onClick={()=>{setPoultryBillingMsg('Modules 2–5 stay locked until real payment verification is live. Your account is still on Free.'); api.trackAnalyticsEvent({ event_name:'poultry_unlock_click_blocked', country: uiCountry, role_hint: me?.role || 'user', properties:{from:'free', target:'basic'} }).catch(()=>{})}}>🔒 Locked — not live yet</button> : <button className='btn' onClick={()=>setOpenPoultryModule(openPoultryModule===i ? -1 : i)}>{openPoultryModule===i ? 'Hide' : 'Open'}</button>}
 </div>
 {!locked && openPoultryModule===i && <div className='list' style={{marginTop:6}}>
 {m.details.map((d)=><div className='list-row' key={d}><span>{d}</span></div>)}
 {poultryTier === 'pro' && <div className='panel' style={{marginTop:8,padding:8,background:'#fffbeb',border:'1px solid #fde68a'}}>
 <strong>{(poultryProModuleDeepDives[poultryTrack] || [])[i]?.title || 'Professional Deep-Dive'}</strong>
 <div className='helper-text' style={{marginTop:4}}>Cadence: {(poultryProModuleDeepDives[poultryTrack] || [])[i]?.cadence || 'Weekly operator review'}</div>
 <div className='list' style={{marginTop:6}}>
 {((poultryProModuleDeepDives[poultryTrack] || [])[i]?.checklist || []).map((step)=><div className='list-row' key={step}><span>{step}</span></div>)}
 </div>
 {!!((poultryProModuleDeepDives[poultryTrack] || [])[i]?.managerNotes) && <div style={{marginTop:6,fontSize:'.85rem',color:'#92400e'}}><strong>Manager note:</strong> {(poultryProModuleDeepDives[poultryTrack] || [])[i]?.managerNotes}</div>}
 </div>}
 </div>}
 </div>
 })}
 </div>
 </article>
 </div>

 {poultryTier !== 'free' && <article className='panel' style={{marginTop:10}}>
 <h4>Climate Priorities + Health Schedule</h4>
 <div className='list'>
 {(poultryZone === 'humid' ? poultryClimate.humid : poultryClimate.dry).map((p)=><div className='list-row' key={p}><span>{p}</span></div>)}
 {poultryVaxProgram.map((v)=><div className='list-row' key={v}><span>{v}</span></div>)}
 </div>
 <div className='panel' style={{marginTop:10,padding:10,background:'#fffaf0',border:'1px solid #fed7aa'}}>
 <strong>{poultryHealthGuides[poultryTrack].title}</strong>
 <div className='list' style={{marginTop:8}}>
 {poultryHealthGuides[poultryTrack].timing.map((item)=><div className='list-row' key={item}><span>{item}</span></div>)}
 {poultryHealthGuides[poultryTrack].vaccines.map((item)=><div className='list-row' key={item}><span>{item}</span></div>)}
 {poultryHealthGuides[poultryTrack].parasite.map((item)=><div className='list-row' key={item}><span>{item}</span></div>)}
 {poultryHealthGuides[poultryTrack].seasonal.map((item)=><div className='list-row' key={item}><span>{item}</span></div>)}
 {poultryHealthGuides[poultryTrack].calendar.map((item)=><div className='list-row' key={item}><span>{item}</span></div>)}
 </div>
 <p style={{fontSize:'.82rem',color:'#64748b',marginTop:8}}>{poultryHealthGuides[poultryTrack].caution}</p>
 <p style={{fontSize:'.82rem',color:'#64748b',marginTop:8}}>Final vaccine brands/timing must be validated with licensed local veterinary authorities before execution.</p>
 </div>
 </article>}

 {poultryTier === 'pro' && <article className='panel poultry-pro-shell' style={{marginTop:10, border:'1.5px solid #f59e0b', background:'#fffbeb'}}>
 <h4 style={{marginTop:0}}>🏆 Executive Tools</h4>
 <div className='list'>
 <div className='list-row'><span>Expanded detailed module content</span></div>
 <div className='list-row'><span>AI Disease Analyzer integration (unlimited)</span></div>
 <div className='list-row'><span>Downloadable farm plans</span></div>
 <div className='list-row'><span>Weekly farm management templates</span></div>
 <div className='list-row'><span>Printable vaccination schedules</span></div>
 <div className='list-row'><span>Expert Q&A access</span></div>
 <div className='list-row'><span>Progress tracking dashboard</span></div>
 <div className='list-row'><span>Benchmark scorecards and report-card print path</span></div>
 </div>

 <div className='panel' style={{marginTop:8,padding:10,background:'#fff7ed',border:'1px solid #fdba74'}}>
 <strong>Premium Operations Desk</strong>
 <div className='helper-text' style={{marginTop:4}}>This area is built to feel like a real working desk: module-by-module execution notes, downloadable operating packs, guided troubleshooting, and print-ready review assets.</div>
 <div className='list' style={{marginTop:8}}>
 <div className='list-row'><span>Current track</span><strong>{poultryTracks[poultryTrack].title}</strong></div>
 <div className='list-row'><span>Operating zone</span><strong>{poultryZone === 'dry' ? 'Dry / Savanna Zone' : 'Humid / Forest Zone'}</strong></div>
 <div className='list-row'><span>Open professional module</span><strong>{openPoultryModule >= 0 ? poultryTracks[poultryTrack].modules[openPoultryModule]?.name : 'Open a module to load its pro checklist'}</strong></div>
 </div>
 </div>

 <div className='poultry-tool-grid' style={{marginTop:8}}>
 <button className={`poultry-tool-card ${active==='ai-disease' ? 'active' : ''}`} onClick={()=>{setActive('ai-disease'); api.trackAnalyticsEvent({ event_name:'poultry_pro_action', country: uiCountry, role_hint: me?.role || 'user', properties:{action:'open_ai_disease'} }).catch(()=>{})}}>
 <strong>AI Disease Analyzer</strong>
 <span>Open the analyzer for symptoms, photos, and flock health review.</span>
 </button>
 <button className={`poultry-tool-card ${poultryQuestion ? 'active' : ''}`} onClick={()=>setPoultryQuestion(`${poultryTracks[poultryTrack].title} • ${poultryZone === 'dry' ? 'Dry / Savanna Zone' : 'Humid / Forest Zone'} • review current flock issue`)}>
 <strong>Guidance Workspace</strong>
 <span>Load a track-specific guidance prompt and build a response plan.</span>
 </button>
 {poultryProDownloads.map((asset)=><a key={asset.filename} className={`poultry-tool-card ${poultryAnswer && poultryAnswer.includes(asset.title) ? 'active' : ''}`} download={asset.filename} href={'data:text/plain;charset=utf-8,'+encodeURIComponent(asset.content)}>
 <strong>{asset.title}</strong>
 <span>Download this premium operating asset.</span>
 </a>)}
 </div>

 <div className='panel' style={{marginTop:8,padding:10,background:'#fff'}}>
 <strong>Expert Q&A Prompt Bank</strong>
 <div className='helper-text' style={{marginTop:6}}>Tap a serious operator question to preload the workspace, then adapt it with your own flock details.</div>
 <div className='poultry-tool-grid' style={{marginTop:8}}>
 {poultryProQaPrompts.map((prompt)=><button key={prompt} className={`poultry-tool-card ${poultryQuestion===prompt ? 'active' : ''}`} onClick={()=>setPoultryQuestion(prompt)}><strong>Use prompt</strong><span>{prompt}</span></button>)}
 </div>
 </div>

 <div className='panel' style={{marginTop:8,padding:10,background:'#fff'}}>
 <strong>Guidance Workspace</strong>
 <div className='helper-text' style={{marginTop:6}}>Use the current track, zone, and your field notes to get a practical next-step playbook. For symptoms or photos, jump straight into the AI Disease Analyzer.</div>
 <div className='inlineForm' style={{marginTop:8}}>
 <input className='input' placeholder='Example: mortality up in week 2 after rain, birds panting at noon' value={poultryQuestion} onChange={(e)=>setPoultryQuestion(e.target.value)} />
 <button className='btn' onClick={()=>{
 const guide = getPoultryGuidancePlaybook(poultryQuestion, poultryTrack, poultryZone)
 setPoultryAnswer(JSON.stringify(guide))
 api.trackAnalyticsEvent({ event_name:'poultry_pro_action', country: uiCountry, role_hint: me?.role || 'user', properties:{action:'generate_guidance_playbook', topic:guide.title, track:poultryTrack, zone:poultryZone} }).catch(()=>{})
 }}>Build Guidance Playbook</button>
 <button className='btn btn-dark' onClick={()=>{setActive('ai-disease'); api.trackAnalyticsEvent({ event_name:'poultry_pro_action', country: uiCountry, role_hint: me?.role || 'user', properties:{action:'guidance_to_ai_disease', track:poultryTrack, zone:poultryZone} }).catch(()=>{})}}>Analyze symptoms / photo</button>
 </div>
 {!!poultryAnswer && (()=>{ const guide = (()=>{ try { return JSON.parse(poultryAnswer) } catch { return null } })(); return guide ? <div className='poultry-guidance-card'>
 <div className='poultry-guidance-head'>
 <div>
 <div className='poultry-guidance-eyebrow'>Guidance playbook</div>
 <h5>{guide.title}</h5>
 </div>
 <div className='poultry-guidance-tags'>
 <span>{guide.trackLabel}</span>
 <span>{guide.zoneLabel}</span>
 </div>
 </div>
 <p className='poultry-guidance-focus'>{guide.focus}</p>
 <div className='list'>
 {guide.actions.map((step, idx)=><div className='list-row' key={step}><span>{idx + 1}. {step}</span></div>)}
 </div>
 <div className='poultry-guidance-escalate'><strong>Escalate when:</strong> {guide.escalate}</div>
 </div> : <p style={{marginTop:8}}>{poultryAnswer}</p> })()}
 </div>

 <div className='panel' style={{marginTop:8,padding:8,background:'#fff'}}>
 <strong>Implementation Tracker</strong>
 <div className='inlineForm' style={{marginTop:6}}>
 <button className='btn' disabled={openPoultryModule < 0} onClick={()=>{
 if (openPoultryModule < 0) return
 const checkpoint = `${poultryTrack}:${openPoultryModule}`
 setPoultryProgress((s)=>({ ...s, completed: Array.from(new Set([...(s.completed||[]), checkpoint])) }))
 api.trackAnalyticsEvent({ event_name:'poultry_checkpoint_complete', country: uiCountry, role_hint: me?.role || 'user', properties:{checkpoint} }).catch(()=>{})
 }}>Mark Current Module Complete</button>
 <div className='list-row' style={{padding:'6px 10px', background:'#fff'}}><span>Completed checkpoints</span><strong>{(poultryProgress.completed||[]).length}</strong></div>
 </div>
 <div className='list'>
 {(poultryProgress.completed||[]).slice(-8).map((c)=> <div className='list-row' key={c}><span>{c}</span></div>)}
 {!(poultryProgress.completed||[]).length && <div className='list-row'><span>No completed checkpoints yet.</span></div>}
 </div>
 </div>
 </article>}

 {poultryTier === 'pro' && <ProfessionalAssets product='poultry' progress={poultryProgress} setProgress={setPoultryProgress} trackKey={poultryTrack} openModule={openPoultryModule} />}

 {poultryTier === 'pro' && (poultryProgress.completed||[]).length >= 3 && <article className='panel' style={{marginTop:10, border:'2px solid #eab308', background:'#fefce8'}}>
 <h4 style={{marginTop:0}}>🎓 Certificate of Completion</h4>
 <p>You have completed required professional checkpoints. Your Poultry University certificate is now available.</p>
 <button className='btn btn-dark' onClick={()=>{window.print(); api.trackAnalyticsEvent({ event_name:'poultry_certificate_print', country: uiCountry, role_hint: me?.role || 'user', properties:{completed:(poultryProgress.completed||[]).length} }).catch(()=>{})}}>Print Certificate</button>
 </article>}
 </section>}



 {active === 'sheep-university' && <section>
 <h3>🐑 Sheep University</h3>
 <div className='panel' style={{marginBottom:10, background:(sheepTier !== 'free' || universitySubscriptions.sheep?.subscription?.status === 'ACTIVE') ? 'linear-gradient(135deg,#0f172a 0%,#14532d 45%,#0f766e 100%)' : 'linear-gradient(135deg,#eff6ff 0%,#faf5ff 100%)', color:(sheepTier !== 'free' || universitySubscriptions.sheep?.subscription?.status === 'ACTIVE') ? '#fff' : '#0f172a', border:(sheepTier !== 'free' || universitySubscriptions.sheep?.subscription?.status === 'ACTIVE') ? '1px solid rgba(255,255,255,.12)' : '1px solid #bfdbfe', boxShadow:(sheepTier !== 'free' || universitySubscriptions.sheep?.subscription?.status === 'ACTIVE') ? '0 18px 40px rgba(15,23,42,.24)' : 'none'}}><div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}><div><div style={{fontSize:'.76rem',fontWeight:800,letterSpacing:'.08em',textTransform:'uppercase',opacity:.9}}>AADU school</div><strong style={{display:'block',fontSize:'1.05rem',marginTop:4}}>{(sheepTier !== 'free' || universitySubscriptions.sheep?.subscription?.status === 'ACTIVE') ? `Sheep University · ${String(universitySubscriptions.sheep?.subscription?.plan_code || sheepTier || '').toUpperCase()} ✓` : 'Sheep University'}</strong><div style={{marginTop:6,color:(sheepTier !== 'free' || universitySubscriptions.sheep?.subscription?.status === 'ACTIVE') ? 'rgba(255,255,255,.88)' : '#1e3a8a'}}>{(sheepTier !== 'free' || universitySubscriptions.sheep?.subscription?.status === 'ACTIVE') ? `Your AADU sheep subscription is active${universitySubscriptions.sheep?.subscription?.reference ? ` • Ref ${universitySubscriptions.sheep.subscription.reference}` : ''}. Full modules are unlocked${sheepTier === 'pro' ? ', with advanced tools available,' : ''} and the upgrade prompts are hidden.` : 'Sheep University frames breed development, flock discipline, lamb survival, and commercial performance as one operating system inside AADU.'}</div></div>{(sheepTier !== 'free' || universitySubscriptions.sheep?.subscription?.status === 'ACTIVE') ? <span className='cover-badge' style={{background:'rgba(255,255,255,.14)', color:'#fff', border:'1px solid rgba(255,255,255,.24)'}}>{String(universitySubscriptions.sheep?.subscription?.status || 'ACTIVE').replaceAll('_',' ')}</span> : null}</div></div>
 <article className='panel' style={{marginBottom:10,border:'1px solid #ddd6fe',background:'#faf5ff'}}>
 <h4 style={{marginTop:0,color:'#6d28d9'}}>Ghana Sheep Breed Development Framework</h4>
 <div className='list'>
 {sheepPhaseLabels.map((p,idx)=><div className='list-row' key={p}><span>{idx===0?'🧬':idx===1?'🔁':'🏆'} {p}</span></div>)}
 </div>
 <p style={{fontSize:'.85rem',color:'#6b21a8'}}>Boboji hardiness + Balami/Uda growth + Ladoum/Dorper finish = Ghana Sheep Breed target line.</p>
 </article>

 <article className='panel' style={{marginBottom:10}}>
 <h4 style={{marginTop:0}}>Access & Delivery Format</h4>
 <div className='three-col'>
 <div className='panel' style={{padding:10, border:sheepTier==='free' || sheepPlanPreview==='free'?'2px solid #7c3aed':'1px solid #e2e8f0', cursor:'pointer'}} onClick={()=>setSheepPlanPreview('free')}>
 <strong>🆓 Preview Access</strong>
 <div style={{fontSize:'.85rem',color:'#475569',margin:'6px 0'}}>Program overview, breed cards, KPIs, and opening pillar.</div>
 <button className='btn' onClick={(e)=>{e.stopPropagation(); setSheepTier('free'); setOpenSheepModule(0); setSheepPlanPreview('free')}}>{sheepTier==='free' ? 'Preview Active ✓' : 'Use Preview'}</button>
 </div>
 <div className='panel' style={{padding:10, border:sheepTier==='basic' || sheepPlanPreview==='basic'?'2px solid #16a34a':'1px solid #e2e8f0', cursor:'pointer', opacity:sheepTier==='basic' || sheepTier==='pro' ? 1 : 1}} onClick={()=>setSheepPlanPreview('basic')}>
 <strong>🌿 Basic — ₵50/mo</strong>
 <div style={{fontSize:'.85rem',color:'#475569',margin:'6px 0'}}>Full pillar access, both operating zones, and health schedule guidance.</div>
 <button className={`btn ${sheepTier==='basic' || sheepTier==='pro' ? '' : 'btn-dark'}`} onClick={(e)=>{e.stopPropagation(); if (sheepTier==='basic' || sheepTier==='pro') { setOpenSheepModule(1); return } startUniversityCheckout('sheep', 'basic', 'Sheep University Basic checkout')}}>{sheepTier==='basic' ? 'Current plan ✓' : sheepTier==='pro' ? 'Included in Professional ✓' : 'Unlock Basic'}</button>
 </div>
 <div className='panel' style={{padding:10, border:sheepTier==='pro' || sheepPlanPreview==='pro'?'2px solid #7c3aed':'1px solid #e2e8f0', cursor:'pointer'}} onClick={()=>setSheepPlanPreview('pro')}>
 <strong>🏆 Professional — ₵120/mo</strong>
 <div style={{fontSize:'.85rem',color:'#475569',margin:'6px 0'}}>Everything in Standard plus operating briefs, benchmark scorecards, printable tools, progress tracking, and certificate outputs.</div>
 <button className={`btn ${sheepTier==='pro' ? '' : 'btn-dark'}`} onClick={(e)=>{e.stopPropagation(); if (sheepTier==='pro') return; startUniversityCheckout('sheep', 'pro', 'Sheep University Professional checkout')}}>{sheepTier==='pro' ? 'Professional active ✓' : 'Go Professional'}</button>
 </div>
 </div>
 <div className='panel' style={{marginTop:8,padding:8,background:'#faf5ff',border:'1px solid #ddd6fe'}}>
 <strong>{universityPlanPreview[sheepPlanPreview].title} includes:</strong>
 <div className='list' style={{marginTop:6}}>
 {universityPlanPreview[sheepPlanPreview].features.map((feature)=><div className='list-row' key={feature}><span>{feature}</span></div>)}
 </div>
 {sheepPlanPreview !== 'free' && sheepTier === 'free' && <div style={{marginTop:8}}><button className='btn btn-dark' onClick={()=>startUniversityCheckout('sheep', sheepPlanPreview, `Sheep University ${sheepPlanPreview === 'pro' ? 'Professional' : 'Basic'} checkout`)}>{sheepPlanPreview === 'pro' ? 'Upgrade to Professional' : 'Upgrade to Basic'}</button></div>}
 </div>
 </article>
 {universitySubscriptions.sheep?.subscription?.status === 'PENDING_PAYMENT' && sheepTier === 'free' && <div className='panel' style={{marginTop:8,padding:8,background:'#eff6ff',border:'1px solid #bfdbfe'}}><strong>Payment pending.</strong> Reference: {universitySubscriptions.sheep.subscription.reference}. <button className='btn btn-dark' style={{marginLeft:8}} onClick={()=>verifyUniversityCheckout('sheep')}>Verify Payment</button></div>}
 {universitySubscriptions.sheep?.subscription?.status === 'ACTIVE' && <div className='panel' style={{marginTop:8,padding:10,background:'linear-gradient(180deg,#ecfeff 0%,#f0fdfa 100%)',border:'1px solid #99f6e4'}}><strong>{String(universitySubscriptions.sheep.subscription.plan_code || '').toUpperCase()} active.</strong> Payment verified, premium content unlocked, and Sheep University is now in paid mode.</div>}
 {!!universityBillingMsg.sheep && <div className='panel' style={{marginTop:8,padding:8,background:'#eff6ff',border:'1px solid #bfdbfe'}}>{universityBillingMsg.sheep}</div>}
 {sheepTier === 'free' && <div className='panel' style={{marginTop:8,padding:8,background:'#f5f3ff',border:'1px solid #ddd6fe'}}><strong>Preview access active.</strong> The opening pillar is available now; the full operating program unlocks with the higher plan.</div>}

 <div className='panel'>
 <div className='inlineForm'>
 <select className='input' value={sheepTrack} onChange={(e)=>setSheepTrack(e.target.value)}>
 <option value='balamiCross'>Boboji × Balami/Sudanese</option>
 <option value='udaCross'>Boboji × Uda/Sudanese</option>
 <option value='ghanaElite'>Ghana Sheep Breed (Elite Finish)</option>
 </select>
 <select className='input' value={sheepZone} onChange={(e)=>setSheepZone(e.target.value)}>
 <option value='humid'>Humid / Forest Zone</option>
 <option value='dry'>Dry / Savanna Zone</option>
 </select>
 </div>
 <h4 style={{marginBottom:4}}>{sheepTracks[sheepTrack].title}</h4>
 <p style={{marginTop:0,color:'#334155'}}>{sheepTracks[sheepTrack].objective}</p>
 </div>

 <div className='two-col'>
 <article className='panel'>
 <h4>Breed Intelligence Cards</h4>
 <div className='list'>
 {sheepTracks[sheepTrack].breeds.map((b)=><div className='list-row' key={b}><span>{b}</span></div>)}
 </div>
 <h4 style={{marginTop:10}}>Target KPIs</h4>
 <div className='list'>
 {sheepTracks[sheepTrack].kpis.map((k)=><div className='list-row' key={k}><strong>{k}</strong></div>)}
 </div>
 </article>

 <article className='panel'>
 <h4>Modules</h4>
 <div className='list'>
 {sheepTracks[sheepTrack].modules.map((m,i)=>{
 const locked = sheepTier === 'free' && i > 0
 return <div key={m.name} className='panel' style={{padding:8,border:locked?'1px solid #e2e8f0':'1px solid #dbe6df',opacity:locked?0.6:1,background:locked?'#f8fafc':'#fff'}}>
 <div className='list-row'>
 <span><strong>{m.name}</strong><br/><span style={{fontSize:'.85rem',color:'#475569'}}>{m.summary}</span></span>
 {locked ? <button className='btn' onClick={()=>startUniversityCheckout('sheep', 'basic', 'Sheep University Basic checkout')}>🔒 Unlock — ₵50/mo</button> : <button className='btn' onClick={()=>setOpenSheepModule(openSheepModule===i ? -1 : i)}>{openSheepModule===i ? 'Hide' : 'Open'}</button>}
 </div>
 {!locked && openSheepModule===i && <div className='list' style={{marginTop:6}}>{m.details.map((d)=><div className='list-row' key={d}><span>{d}</span></div>)}</div>}
 </div>
 })}
 </div>
 </article>
 </div>

 {sheepTier !== 'free' && <article className='panel' style={{marginTop:10}}>
 <h4>Climate Priorities + Vaccination/Health Schedule</h4>
 <div className='list'>
 {(sheepZone === 'humid' ? sheepClimate.humid : sheepClimate.dry).map((p)=><div className='list-row' key={p}><span>{p}</span></div>)}
 {sheepHealthProgram.map((v)=><div className='list-row' key={v}><span>{v}</span></div>)}
 </div>
 <div className='panel' style={{marginTop:10,padding:10,background:'#fcfbff',border:'1px solid #ddd6fe'}}>
 <strong>{livestockHealthGuides.sheep.title}</strong>
 <div className='list' style={{marginTop:8}}>
 {livestockHealthGuides.sheep.timing.map((item)=><div className='list-row' key={item}><span>{item}</span></div>)}
 {livestockHealthGuides.sheep.vaccines.map((item)=><div className='list-row' key={item}><span>{item}</span></div>)}
 {livestockHealthGuides.sheep.deworm.map((item)=><div className='list-row' key={item}><span>{item}</span></div>)}
 {livestockHealthGuides.sheep.calendar.map((item)=><div className='list-row' key={item}><span>{item}</span></div>)}
 </div>
 <p style={{fontSize:'.82rem',color:'#64748b',marginTop:8}}>{livestockHealthGuides.sheep.caution}</p>
 </div>
 </article>}

 {sheepTier === 'pro' && <UniversityExecutiveToolkit product='sheep' progress={sheepProgress} setProgress={setSheepProgress} trackKey={sheepTrack} openModule={openSheepModule} question={sheepQuestion} setQuestion={setSheepQuestion} answer={sheepAnswer} setAnswer={setSheepAnswer} />}

 {sheepTier === 'pro' && <ProfessionalAssets product='sheep' progress={sheepProgress} setProgress={setSheepProgress} trackKey={sheepTrack} openModule={openSheepModule} />}

 {sheepTier === 'pro' && (sheepProgress.completed||[]).length >= 3 && <article className='panel' style={{marginTop:10, border:'2px solid #7c3aed', background:'#f5f3ff'}}>
 <h4 style={{marginTop:0}}>🎓 Certificate of Completion</h4>
 <p>You have completed required sheep-program checkpoints. Certificate is ready.</p>
 <button className='btn btn-dark' onClick={()=>window.print()}>Print Certificate</button>
 </article>}
 </section>}



 {active === 'goat-university' && <section>
 <h3>🐐 Goat University</h3>
 <div className='panel' style={{marginBottom:10, background:'linear-gradient(135deg,#eff6ff 0%,#f0fdfa 100%)', border:'1px solid #bfdbfe'}}>
 <div style={{fontSize:'.76rem',fontWeight:800,letterSpacing:'.08em',textTransform:'uppercase',color:'#0f766e'}}>AADU school</div>
 <strong style={{display:'block',marginTop:4}}>Goat University</strong>
 <div style={{marginTop:6,color:'#334155'}}>Goat University organizes breeding strategy, kidding management, parasite control, and market-ready herd development into a practical AADU reference for operators, managers, and technical partners.</div>
 </div>
 <article className='panel' style={{marginBottom:10,border:'1px solid #99f6e4',background:'#f0fdfa'}}>
 <h4 style={{marginTop:0,color:'#0f766e'}}>Ghana Goat Breed Development Framework</h4>
 <div className='list'>
 {goatPhaseLabels.map((p,idx)=><div className='list-row' key={p}><span>{idx===0?'🧬':idx===1?'🔁':'🏆'} {p}</span></div>)}
 </div>
 <p style={{fontSize:'.85rem',color:'#0f766e'}}>WAD hardiness + Sahelian height/frame + Boer/Kalahari/Savannah finish.</p>
 </article>

 <article className='panel' style={{marginBottom:10}}>
 <h4 style={{marginTop:0}}>Access & Delivery Format</h4>
 <div className='three-col'>
 <div className='panel' style={{padding:10, border:goatTier==='free' || goatPlanPreview==='free'?'2px solid #0d9488':'1px solid #e2e8f0', cursor:'pointer'}} onClick={()=>setGoatPlanPreview('free')}>
 <strong>🆓 Preview Access</strong>
 <div style={{fontSize:'.85rem',color:'#475569',margin:'6px 0'}}>Program overview, breed cards, KPIs, and opening pillar.</div>
 <button className='btn' onClick={(e)=>{e.stopPropagation(); setGoatTier('free'); setOpenGoatModule(0); setGoatPlanPreview('free')}}>{goatTier==='free' ? 'Preview Active ✓' : 'Use Preview'}</button>
 </div>
 <div className='panel' style={{padding:10, border:goatTier==='basic' || goatPlanPreview==='basic'?'2px solid #16a34a':'1px solid #e2e8f0', cursor:'pointer'}} onClick={()=>setGoatPlanPreview('basic')}>
 <strong>🌿 Basic — ₵50/mo</strong>
 <div style={{fontSize:'.85rem',color:'#475569',margin:'6px 0'}}>Full pillar access, both operating zones, and health schedule guidance.</div>
 <button className={`btn ${hasActiveUniversityAccess('goat') ? '' : 'btn-dark'}`} onClick={(e)=>{e.stopPropagation(); if (hasActiveUniversityAccess('goat')) { showAlreadyActiveMessage('goat'); openUniversityProduct('goat'); return } startUniversityCheckout('goat', 'basic', 'Goat University Basic checkout')}}>{hasActiveUniversityAccess('goat') ? 'Access active ✓' : 'Unlock Basic'}</button>
 </div>
 <div className='panel' style={{padding:10, border:goatTier==='pro' || goatPlanPreview==='pro'?'2px solid #0d9488':'1px solid #e2e8f0', cursor:'pointer'}} onClick={()=>setGoatPlanPreview('pro')}>
 <strong>🏆 Professional — ₵120/mo</strong>
 <div style={{fontSize:'.85rem',color:'#475569',margin:'6px 0'}}>Everything in Standard plus operating briefs, benchmark scorecards, printable tools, progress tracking, and certificate outputs.</div>
 <button className={`btn ${hasActiveUniversityAccess('goat') ? '' : 'btn-dark'}`} onClick={(e)=>{e.stopPropagation(); if (hasActiveUniversityAccess('goat')) { showAlreadyActiveMessage('goat'); openUniversityProduct('goat'); return } startUniversityCheckout('goat', 'pro', 'Goat University Professional checkout')}}>{hasActiveUniversityAccess('goat') ? 'Professional access active ✓' : 'Go Professional'}</button>
 </div>
 </div>
 <div className='panel' style={{marginTop:8,padding:8,background:'#f0fdfa',border:'1px solid #99f6e4'}}>
 <strong>{universityPlanPreview[goatPlanPreview].title} includes:</strong>
 <div className='list' style={{marginTop:6}}>
 {universityPlanPreview[goatPlanPreview].features.map((feature)=><div className='list-row' key={feature}><span>{feature}</span></div>)}
 </div>
 {goatPlanPreview !== 'free' && <div style={{marginTop:8}}><button className={`btn ${hasActiveUniversityAccess('goat') ? '' : 'btn-dark'}`} onClick={()=>{ if (hasActiveUniversityAccess('goat')) { showAlreadyActiveMessage('goat'); openUniversityProduct('goat'); return } startUniversityCheckout('goat', goatPlanPreview, `Goat University ${goatPlanPreview === 'pro' ? 'Professional' : 'Basic'} checkout`) }}>{hasActiveUniversityAccess('goat') ? 'Access active ✓' : (goatPlanPreview === 'pro' ? 'Upgrade to Professional' : 'Upgrade to Basic')}</button></div>}
 </div>
 </article>
 {universitySubscriptions.goat?.subscription?.status === 'PENDING_PAYMENT' && <div className='panel' style={{marginTop:8,padding:8,background:'#eff6ff',border:'1px solid #bfdbfe'}}><strong>Payment pending.</strong> Reference: {universitySubscriptions.goat.subscription.reference}. <button className='btn btn-dark' style={{marginLeft:8}} onClick={()=>verifyUniversityCheckout('goat')}>Verify Payment</button></div>}
 {universitySubscriptions.goat?.subscription?.status === 'ACTIVE' && <div className='panel' style={{marginTop:8,padding:8,background:'#ecfeff',border:'1px solid #99f6e4'}}><strong>{String(universitySubscriptions.goat.subscription.plan_code || '').toUpperCase()} active.</strong> Server-side subscription verified.</div>}
 {!!universityBillingMsg.goat && <div className='panel' style={{marginTop:8,padding:8,background:'#eff6ff',border:'1px solid #bfdbfe'}}>{universityBillingMsg.goat}</div>}
 {goatTier === 'free' && <div className='panel' style={{marginTop:8,padding:8,background:'#f0fdfa',border:'1px solid #99f6e4'}}><strong>Preview access active.</strong> The opening pillar is available now; the full operating program unlocks with the higher plan.</div>}

 <div className='panel'>
 <div className='inlineForm'>
 <select className='input' value={goatTrack} onChange={(e)=>setGoatTrack(e.target.value)}>
 <option value='sahelianCross'>WAD × Sahelian</option>
 <option value='redSokotoMaradiCross'>WAD × Red Sokoto/Maradi</option>
 <option value='ghanaElite'>Ghana Goat Breed (Elite)</option>
 </select>
 <select className='input' value={goatZone} onChange={(e)=>setGoatZone(e.target.value)}>
 <option value='humid'>Humid / Forest Zone</option>
 <option value='dry'>Dry / Savanna Zone</option>
 </select>
 </div>
 <h4 style={{marginBottom:4}}>{goatTracks[goatTrack].title}</h4>
 <p style={{marginTop:0,color:'#334155'}}>{goatTracks[goatTrack].objective}</p>
 </div>

 <div className='two-col'>
 <article className='panel'>
 <h4>Breed Intelligence Cards</h4>
 <div className='list'>
 {goatTracks[goatTrack].breeds.map((b)=><div className='list-row' key={b}><span>{b}</span></div>)}
 </div>
 <h4 style={{marginTop:10}}>Target KPIs</h4>
 <div className='list'>
 {goatTracks[goatTrack].kpis.map((k)=><div className='list-row' key={k}><strong>{k}</strong></div>)}
 </div>
 </article>

 <article className='panel'>
 <h4>Modules</h4>
 <div className='list'>
 {goatTracks[goatTrack].modules.map((m,i)=>{
 const locked = goatTier === 'free' && i > 0
 return <div key={m.name} className='panel' style={{padding:8,border:locked?'1px solid #e2e8f0':'1px solid #dbe6df',opacity:locked?0.6:1,background:locked?'#f8fafc':'#fff'}}>
 <div className='list-row'>
 <span><strong>{m.name}</strong><br/><span style={{fontSize:'.85rem',color:'#475569'}}>{m.summary}</span></span>
 {locked ? <button className='btn' onClick={()=>startUniversityCheckout('goat', 'basic', 'Goat University Basic checkout')}>🔒 Unlock — ₵50/mo</button> : <button className='btn' onClick={()=>setOpenGoatModule(openGoatModule===i ? -1 : i)}>{openGoatModule===i ? 'Hide' : 'Open'}</button>}
 </div>
 {!locked && openGoatModule===i && <div className='list' style={{marginTop:6}}>{m.details.map((d)=><div className='list-row' key={d}><span>{d}</span></div>)}</div>}
 </div>
 })}
 </div>
 </article>
 </div>

 {goatTier !== 'free' && <article className='panel' style={{marginTop:10}}>
 <h4>Climate Priorities + Health Schedule</h4>
 <div className='list'>
 {(goatZone === 'humid' ? goatClimate.humid : goatClimate.dry).map((p)=><div className='list-row' key={p}><span>{p}</span></div>)}
 {goatHealthProgram.map((v)=><div className='list-row' key={v}><span>{v}</span></div>)}
 </div>
 <div className='panel' style={{marginTop:10,padding:10,background:'#f4fffe',border:'1px solid #99f6e4'}}>
 <strong>{livestockHealthGuides.goat.title}</strong>
 <div className='list' style={{marginTop:8}}>
 {livestockHealthGuides.goat.timing.map((item)=><div className='list-row' key={item}><span>{item}</span></div>)}
 {livestockHealthGuides.goat.vaccines.map((item)=><div className='list-row' key={item}><span>{item}</span></div>)}
 {livestockHealthGuides.goat.deworm.map((item)=><div className='list-row' key={item}><span>{item}</span></div>)}
 {livestockHealthGuides.goat.calendar.map((item)=><div className='list-row' key={item}><span>{item}</span></div>)}
 </div>
 <p style={{fontSize:'.82rem',color:'#64748b',marginTop:8}}>Goat-specific warning: CCPP and Haemonchus risks require strict routine monitoring.</p>
 <p style={{fontSize:'.82rem',color:'#64748b',marginTop:8}}>{livestockHealthGuides.goat.caution}</p>
 </div>
 </article>}

 {goatTier === 'pro' && <UniversityExecutiveToolkit product='goat' progress={goatProgress} setProgress={setGoatProgress} trackKey={goatTrack} openModule={openGoatModule} question={goatQuestion} setQuestion={setGoatQuestion} answer={goatAnswer} setAnswer={setGoatAnswer} />}

 {goatTier === 'pro' && <ProfessionalAssets product='goat' progress={goatProgress} setProgress={setGoatProgress} trackKey={goatTrack} openModule={openGoatModule} />}

 {goatTier === 'pro' && (goatProgress.completed||[]).length >= 3 && <article className='panel' style={{marginTop:10, border:'2px solid #0d9488', background:'#f0fdfa'}}>
 <h4 style={{marginTop:0}}>🎓 Certificate of Completion</h4>
 <p>You have completed required goat-program checkpoints. Certificate is ready.</p>
 <button className='btn btn-dark' onClick={()=>window.print()}>Print Certificate</button>
 </article>}
 </section>}



 {active === 'cattle-university' && <section>
 <h3>🐄 Cattle University</h3>
 <div className='panel' style={{marginBottom:10, background:'linear-gradient(135deg,#eff6ff 0%,#fffbeb 100%)', border:'1px solid #bfdbfe'}}>
 <div style={{fontSize:'.76rem',fontWeight:800,letterSpacing:'.08em',textTransform:'uppercase',color:'#92400e'}}>AADU school</div>
 <strong style={{display:'block',marginTop:4}}>Cattle University</strong>
 <div style={{marginTop:6,color:'#334155'}}>Cattle University brings herd improvement, calving discipline, health scheduling, and commercial growth management into one working AADU reference for serious cattle operations.</div>
 </div>
 <article className='panel' style={{marginBottom:10,border:'1px solid #fde68a',background:'#fffbeb'}}>
 <h4 style={{marginTop:0,color:'#92400e'}}>Ghana Cattle Breed Program (3 Phases)</h4>
 <p style={{fontSize:'.85rem',color:'#92400e'}}>Final breeding sires: <strong>Brahman or Gudali</strong>.</p>
 <div className='list'>
 {cattlePhaseLabels.map((p,idx)=><div className='list-row' key={p}><span>{idx===0?'🧬':idx===1?'🔁':'🏆'} {p}</span></div>)}
 </div>
 </article>

 <article className='panel' style={{marginBottom:10}}>
 <h4 style={{marginTop:0}}>Access & Delivery Format</h4>
 <div className='three-col'>
 <div className='panel' style={{padding:10, border:cattleTier==='free' || cattlePlanPreview==='free'?'2px solid #d97706':'1px solid #e2e8f0', cursor:'pointer'}} onClick={()=>setCattlePlanPreview('free')}>
 <strong>🆓 Preview Access</strong>
 <div style={{fontSize:'.85rem',color:'#475569',margin:'6px 0'}}>Program overview, breed cards, KPIs, and opening pillar.</div>
 <button className='btn' onClick={(e)=>{e.stopPropagation(); setCattleTier('free'); setOpenCattleModule(0); setCattlePlanPreview('free')}}>{cattleTier==='free' ? 'Preview Active ✓' : 'Use Preview'}</button>
 </div>
 <div className='panel' style={{padding:10, border:cattleTier==='basic' || cattlePlanPreview==='basic'?'2px solid #16a34a':'1px solid #e2e8f0', cursor:'pointer'}} onClick={()=>setCattlePlanPreview('basic')}>
 <strong>🌿 Basic — ₵50/mo</strong>
 <div style={{fontSize:'.85rem',color:'#475569',margin:'6px 0'}}>Full pillar access, both operating zones, and health schedule guidance.</div>
 <button className={`btn ${hasActiveUniversityAccess('cattle') ? '' : 'btn-dark'}`} onClick={(e)=>{e.stopPropagation(); if (hasActiveUniversityAccess('cattle')) { showAlreadyActiveMessage('cattle'); openUniversityProduct('cattle'); return } startUniversityCheckout('cattle', 'basic', 'Cattle University Basic checkout')}}>{hasActiveUniversityAccess('cattle') ? 'Access active ✓' : 'Unlock Basic'}</button>
 </div>
 <div className='panel' style={{padding:10, border:cattleTier==='pro' || cattlePlanPreview==='pro'?'2px solid #d97706':'1px solid #e2e8f0', cursor:'pointer'}} onClick={()=>setCattlePlanPreview('pro')}>
 <strong>🏆 Professional — ₵120/mo</strong>
 <div style={{fontSize:'.85rem',color:'#475569',margin:'6px 0'}}>Everything in Standard plus operating briefs, benchmark scorecards, printable tools, progress tracking, and certificate outputs.</div>
 <button className={`btn ${hasActiveUniversityAccess('cattle') ? '' : 'btn-dark'}`} onClick={(e)=>{e.stopPropagation(); if (hasActiveUniversityAccess('cattle')) { showAlreadyActiveMessage('cattle'); openUniversityProduct('cattle'); return } startUniversityCheckout('cattle', 'pro', 'Cattle University Professional checkout')}}>{hasActiveUniversityAccess('cattle') ? 'Professional access active ✓' : 'Go Professional'}</button>
 </div>
 </div>
 <div className='panel' style={{marginTop:8,padding:8,background:'#fffbeb',border:'1px solid #fde68a'}}>
 <strong>{universityPlanPreview[cattlePlanPreview].title} includes:</strong>
 <div className='list' style={{marginTop:6}}>
 {universityPlanPreview[cattlePlanPreview].features.map((feature)=><div className='list-row' key={feature}><span>{feature}</span></div>)}
 </div>
 {cattlePlanPreview !== 'free' && <div style={{marginTop:8}}><button className={`btn ${hasActiveUniversityAccess('cattle') ? '' : 'btn-dark'}`} onClick={()=>{ if (hasActiveUniversityAccess('cattle')) { showAlreadyActiveMessage('cattle'); openUniversityProduct('cattle'); return } startUniversityCheckout('cattle', cattlePlanPreview, `Cattle University ${cattlePlanPreview === 'pro' ? 'Professional' : 'Basic'} checkout`) }}>{hasActiveUniversityAccess('cattle') ? 'Access active ✓' : (cattlePlanPreview === 'pro' ? 'Upgrade to Professional' : 'Upgrade to Basic')}</button></div>}
 </div>
 </article>
 {universitySubscriptions.cattle?.subscription?.status === 'PENDING_PAYMENT' && <div className='panel' style={{marginTop:8,padding:8,background:'#eff6ff',border:'1px solid #bfdbfe'}}><strong>Payment pending.</strong> Reference: {universitySubscriptions.cattle.subscription.reference}. <button className='btn btn-dark' style={{marginLeft:8}} onClick={()=>verifyUniversityCheckout('cattle')}>Verify Payment</button></div>}
 {universitySubscriptions.cattle?.subscription?.status === 'ACTIVE' && <div className='panel' style={{marginTop:8,padding:8,background:'#ecfeff',border:'1px solid #99f6e4'}}><strong>{String(universitySubscriptions.cattle.subscription.plan_code || '').toUpperCase()} active.</strong> Server-side subscription verified.</div>}
 {!!universityBillingMsg.cattle && <div className='panel' style={{marginTop:8,padding:8,background:'#eff6ff',border:'1px solid #bfdbfe'}}>{universityBillingMsg.cattle}</div>}

 <div className='panel'>
 <div className='inlineForm'>
 <select className='input' value={cattleTrack} onChange={(e)=>setCattleTrack(e.target.value)}>
 <option value='wadSanga'>WAD/Sanga × Sahelian/Zebu</option>
 <option value='wadFulani'>WAD/Sanga × White Fulani/Sudanese</option>
 <option value='ghanaElite'>Ghana Cattle Breed (Elite)</option>
 </select>
 <select className='input' value={cattleZone} onChange={(e)=>setCattleZone(e.target.value)}>
 <option value='humid'>Humid / Forest Zone</option>
 <option value='dry'>Dry / Savanna Zone</option>
 </select>
 </div>
 <h4 style={{marginBottom:4}}>{cattleTracks[cattleTrack].title}</h4>
 <p style={{marginTop:0,color:'#334155'}}>{cattleTracks[cattleTrack].objective}</p>
 </div>

 <div className='two-col'>
 <article className='panel'>
 <h4>Breed Intelligence Cards</h4>
 <div className='list'>
 {cattleTracks[cattleTrack].breeds.map((b)=><div className='list-row' key={b}><span>{b}</span></div>)}
 </div>
 <h4 style={{marginTop:10}}>Target KPIs</h4>
 <div className='list'>
 {cattleTracks[cattleTrack].kpis.map((k)=><div className='list-row' key={k}><strong>{k}</strong></div>)}
 </div>
 </article>

 <article className='panel'>
 <h4>Modules</h4>
 <div className='list'>
 {cattleTracks[cattleTrack].modules.map((m,i)=>{
 const locked = cattleTier === 'free' && i > 0
 return <div key={m.name} className='panel' style={{padding:8,border:locked?'1px solid #e2e8f0':'1px solid #dbe6df',opacity:locked?0.6:1,background:locked?'#f8fafc':'#fff'}}>
 <div className='list-row'>
 <span><strong>{m.name}</strong><br/><span style={{fontSize:'.85rem',color:'#475569'}}>{m.summary}</span></span>
 {locked ? <button className='btn' onClick={()=>startUniversityCheckout('cattle', 'basic', 'Cattle University Basic checkout')}>🔒 Unlock — ₵50/mo</button> : <button className='btn' onClick={()=>setOpenCattleModule(openCattleModule===i ? -1 : i)}>{openCattleModule===i ? 'Hide' : 'Open'}</button>}
 </div>
 {!locked && openCattleModule===i && <div className='list' style={{marginTop:6}}>{m.details.map((d)=><div className='list-row' key={d}><span>{d}</span></div>)}</div>}
 </div>
 })}
 </div>
 </article>
 </div>

 {cattleTier !== 'free' && <article className='panel' style={{marginTop:10}}>
 <h4>Climate Priorities + Health Schedule</h4>
 <div className='list'>
 {(cattleZone === 'humid' ? cattleClimate.humid : cattleClimate.dry).map((p)=><div className='list-row' key={p}><span>{p}</span></div>)}
 {cattleHealthProgram.map((v)=><div className='list-row' key={v}><span>{v}</span></div>)}
 </div>
 <div className='panel' style={{marginTop:10,padding:10,background:'#fffaf0',border:'1px solid #fde68a'}}>
 <strong>{livestockHealthGuides.cattle.title}</strong>
 <div className='list' style={{marginTop:8}}>
 {livestockHealthGuides.cattle.timing.map((item)=><div className='list-row' key={item}><span>{item}</span></div>)}
 {livestockHealthGuides.cattle.vaccines.map((item)=><div className='list-row' key={item}><span>{item}</span></div>)}
 {livestockHealthGuides.cattle.deworm.map((item)=><div className='list-row' key={item}><span>{item}</span></div>)}
 {livestockHealthGuides.cattle.calendar.map((item)=><div className='list-row' key={item}><span>{item}</span></div>)}
 </div>
 <p style={{fontSize:'.82rem',color:'#64748b',marginTop:8}}>{livestockHealthGuides.cattle.caution}</p>
 </div>
 </article>}

 {cattleTier === 'pro' && <UniversityExecutiveToolkit product='cattle' progress={cattleProgress} setProgress={setCattleProgress} trackKey={cattleTrack} openModule={openCattleModule} question={cattleQuestion} setQuestion={setCattleQuestion} answer={cattleAnswer} setAnswer={setCattleAnswer} />}

 {cattleTier === 'pro' && <ProfessionalAssets product='cattle' progress={cattleProgress} setProgress={setCattleProgress} trackKey={cattleTrack} openModule={openCattleModule} />}

 {cattleTier === 'pro' && (cattleProgress.completed||[]).length >= 3 && <article className='panel' style={{marginTop:10, border:'2px solid #d97706', background:'#fff7ed'}}>
 <h4 style={{marginTop:0}}>🎓 Certificate of Completion</h4>
 <p>You have completed required cattle-program checkpoints. Certificate is ready.</p>
 <button className='btn btn-dark' onClick={()=>window.print()}>Print Certificate</button>
 </article>}
 </section>}

 {active === 'livestock-records' && <section className='records-home-screen'>
 <div className='records-shell'>
  <div className='records-hero-card'>
   <div>
    <div className='records-eyebrow'>FARMSAVIOR RECORDS</div>
    <h3>Livestock Records</h3>
    <p>Run your flock or herd from one clear mobile-first workspace with quick counts, practical record capture, and an easy path from summary to details to edit.</p>
   </div>
   <div className='records-hero-actions'>
    <button type='button' className='btn' onClick={() => { setSelectedLivestockRecord(null); setSelectedOffspringRecord(null); setRecordsSectionOpen(prev => ({ ...prev, create: false, edit: false, details: false })) }}>Reset view</button>
    <button type='button' className='btn btn-dark' onClick={() => { setSelectedLivestockRecord(null); setSelectedOffspringRecord(null); setRecordsSectionOpen(prev => ({ ...prev, create: true, edit: false, details: false })) }}>Add animal</button>
   </div>
  </div>

  <div className='records-overview-grid'>
   <article className='records-stat-card records-stat-card-primary'>
    <span>Total records</span>
    <strong>{livestockRecordsCounts.ALL}</strong>
    <small>{effectiveLivestockSubscription?.tier === 'premium' ? 'Premium tier active' : `Free tier${effectiveLivestockSubscription?.record_limit ? ` · limit ${effectiveLivestockSubscription.record_limit}` : ''}`}</small>
   </article>
   <article className='records-stat-card'>
    <span>Active animals</span>
    <strong>{livestockRecordsSummary.active}</strong>
    <small>Not sold or marked deceased</small>
   </article>
   <article className='records-stat-card'>
    <span>Need attention</span>
    <strong>{livestockRecordsSummary.needsAttention}</strong>
    <small>Health status flagged</small>
   </article>
   <article className='records-stat-card'>
    <span>Breeding-linked</span>
    <strong>{livestockRecordsSummary.bred}</strong>
    <small>Lineage or litter data present</small>
   </article>
  </div>

  <div className='records-main-grid'>
   <div className='records-home-column'>
    <article className='panel records-panel records-list-panel'>
     <div className='records-panel-head'>
      <div>
       <div className='records-panel-title'>Record home</div>
       <div className='helper-text'>Filter by species, then open any card for details or edit.</div>
      </div>
      <div className='records-panel-pill'>{livestockRecordsFiltered.length} showing</div>
     </div>
     <div className='records-filter-strip'>
      <button type='button' className={`records-chip ${livestockRecordsFilter==='ALL' ? 'active' : ''}`} onClick={() => setLivestockRecordsFilter('ALL')}>All · {livestockRecordsCounts.ALL}</button>
      <button type='button' className={`records-chip ${livestockRecordsFilter==='SHEEP' ? 'active' : ''}`} onClick={() => setLivestockRecordsFilter('SHEEP')}>Sheep · {livestockRecordsCounts.SHEEP}</button>
      <button type='button' className={`records-chip ${livestockRecordsFilter==='GOAT' ? 'active' : ''}`} onClick={() => setLivestockRecordsFilter('GOAT')}>Goats · {livestockRecordsCounts.GOAT}</button>
      <button type='button' className={`records-chip ${livestockRecordsFilter==='CATTLE' ? 'active' : ''}`} onClick={() => setLivestockRecordsFilter('CATTLE')}>Cattle · {livestockRecordsCounts.CATTLE}</button>
      <button type='button' className={`records-chip ${livestockRecordsFilter==='POULTRY' ? 'active' : ''}`} onClick={() => setLivestockRecordsFilter('POULTRY')}>Poultry · {livestockRecordsCounts.POULTRY}</button>
     </div>
     <div className='records-card-feed'>
      {livestockRecordsFiltered.map((r) => <button type='button' key={`record-card-${r.id}`} className={`records-card ${currentLivestockRecord?.id === r.id ? 'active' : ''}`} onClick={() => { setSelectedOffspringRecord(null); setSelectedLivestockRecord(r); setRecordsSectionOpen(prev => ({ ...prev, details: true, edit: false, create: false })) }}>
       <div className='records-card-top'>
        <div>
         <div className='records-card-id'>{r.id || '—'}</div>
         <div className='records-card-name'>{r.name || 'Unnamed animal'}</div>
        </div>
        <div className='records-card-arrow'>›</div>
       </div>
       <div className='records-card-tags'>
        <span>{r.species || '—'}</span>
        <span>{r.animal_type || '—'}</span>
        <span>{r.ear_tag || 'No ear tag'}</span>
       </div>
       <div className='records-card-meta'>{r.pen_location || r.purchased_from || 'No location or breeder recorded'}</div>
       <div className='records-card-status'>{r.health_status || 'No health status yet'}</div>
      </button>)}
      {livestockRecordsFiltered.length === 0 && <div className='records-empty-state'>
       <strong>No records yet for this filter.</strong>
       <span>Start with a clean animal profile, then use details to manage health, offspring, and edits.</span>
       <button type='button' className='btn btn-dark' onClick={() => setRecordsSectionOpen(prev => ({ ...prev, create: true, edit: false, details: false }))}>Create first record</button>
      </div>}
     </div>
    </article>
   </div>

   <div className='records-detail-column'>
    {(recordsSectionOpen.create || recordsSectionOpen.edit) && <article className='panel records-panel records-form-panel' style={{position:'fixed', inset:0, zIndex:230, margin:0, borderRadius:0, overflow:'auto', background:'#f8fafc', padding:'16px 12px 28px'}}>
     <div className='records-panel-head'>
      <div>
       <div className='records-panel-title'>{recordsSectionOpen.edit ? 'Edit animal record' : 'Create animal record'}</div>
       <div className='helper-text'>{recordsSectionOpen.edit ? 'Update the selected record without leaving the records home.' : 'Capture the core identity, purchase, and health fields in one clean pass.'}</div>
      </div>
      <button type='button' className='btn' onClick={() => setRecordsSectionOpen(prev => ({ ...prev, create: false, edit: false, details: !!currentLivestockRecord }))}>Close</button>
     </div>
     <form className='records-form-grid' onSubmit={async e => {
      e.preventDefault()
      const form = recordsSectionOpen.edit ? livestockRecordEdit : livestockRecordForm
      const busyKey = recordsSectionOpen.edit ? 'livestock-edit' : 'livestock-create'
      setActionBusy(busyKey)
      try {
       const { treatment_entry, ...payload } = form
       const normalizedPayload = {
        ...payload,
        user_id: Number((recordsSectionOpen.edit ? form.user_id : (me?.id || form.user_id)) || 0),
        stars: Number(form.stars || 0),
        purchase_price: form.purchase_price === '' ? null : Number(form.purchase_price),
        litter_size: form.litter_size === '' ? null : Number(form.litter_size),
        initial_weight_kg: form.initial_weight_kg === '' ? null : Number(form.initial_weight_kg),
        sale_price: form.sale_price === '' ? null : Number(form.sale_price),
        date_of_birth: form.date_of_birth || null,
        acquisition_date: form.acquisition_date || null,
        sale_date: form.sale_date || null,
        died_date: form.died_date || null,
       }
       normalizedPayload.notes = mergeNotesWithAttachments(normalizedPayload.notes, animalUploads)
       if (recordsSectionOpen.edit) await api.updateLivestockRecord(Number(form.id), normalizedPayload)
       else await api.createLivestockRecord(normalizedPayload)
       await loadLivestockRecords()
       if (recordsSectionOpen.edit) {
        const fresh = state.livestockRecords.find(x => Number(x.id) === Number(form.id))
        if (fresh) setSelectedLivestockRecord(fresh)
       } else {
        setLivestockRecordForm({ user_id: '', ownership: 'Owned by Me', species: 'SHEEP', animal_type: 'EWE', name: '', ear_tag: '', farm_id: '', registration_number: '', stars: 0, date_of_birth: '', acquisition_date: '', purchased_from: '', purchased_from_type: 'BREEDER', purchase_price: '', currency: 'GHS', sire_id: '', dam_id: '', litter_size: 1, initial_weight_kg: '', breeding_type: 'Natural', castrated: false, sale_date: '', sale_price: '', sold_to: '', died_date: '', cull_keep_status: 'KEEP', cull_reason: '', health_status: '', pen_location: '', notes: '', treatment_entry: '' })
        setAnimalUploads({ photos: [], docs: [] })
       }
       setRecordsSectionOpen(prev => ({ ...prev, create: false, edit: false, details: true }))
      } catch (err) {
       alert(`${recordsSectionOpen.edit ? 'Update' : 'Create'} failed: ${errMsg(err)}`)
      } finally { setActionBusy('') }
     }}>
      {(() => {
       const form = recordsSectionOpen.edit ? livestockRecordEdit : livestockRecordForm
       const setForm = recordsSectionOpen.edit ? setLivestockRecordEdit : setLivestockRecordForm
       return <>
        <label className='records-field records-field-wide'><span>Name</span><input className='input' placeholder='Animal name' value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
        <label className='records-field'><span>Species</span><select className='input' value={form.species} onChange={e => setForm({ ...form, species: e.target.value, animal_type: e.target.value === 'GOAT' ? 'DOE' : (e.target.value === 'CATTLE' ? 'COW' : (e.target.value === 'POULTRY' ? 'LAYER_HEN' : 'EWE')) })}><option value='SHEEP'>Sheep</option><option value='GOAT'>Goat</option><option value='CATTLE'>Cattle</option><option value='POULTRY'>Poultry</option></select></label>
        <label className='records-field'><span>{form.species === 'POULTRY' ? 'Sex / category' : 'Sex'}</span><select className='input' value={form.animal_type} onChange={e => setForm({ ...form, animal_type: e.target.value })}>{form.species === 'GOAT' ? <><option value='DOE'>Doe</option><option value='BUCK'>Buck</option></> : (form.species === 'CATTLE' ? <><option value='COW'>Cow</option><option value='BULL'>Bull</option><option value='HEIFER'>Heifer</option><option value='STEER'>Steer</option></> : (form.species === 'POULTRY' ? <><option value='LAYER_HEN'>Layer hen</option><option value='BROILER'>Broiler</option><option value='PULLET'>Pullet</option><option value='COCKEREL'>Cockerel</option><option value='CHICK'>Chick</option><option value='BREEDER'>Breeder</option></> : <><option value='EWE'>Ewe</option><option value='RAM'>Ram</option></>))}</select></label>
        <label className='records-field'><span>Ear tag</span><input className='input' placeholder='Ear tag / ID' value={form.ear_tag} onChange={e => setForm({ ...form, ear_tag: e.target.value })} /></label>
        <label className='records-field'><span>Registration no.</span><input className='input' placeholder='Registration number' value={form.registration_number} onChange={e => setForm({ ...form, registration_number: e.target.value })} /></label>
        <label className='records-field'><span>Ownership</span><select className='input' value={form.ownership} onChange={e => setForm({ ...form, ownership: e.target.value })}><option value='OWNED'>Owned by me</option><option value='THIRD_PARTY'>Owned by someone else</option></select></label>
        <label className='records-field'><span>Date of birth</span><div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:8}}><input className='input' type='date' value={form.date_of_birth} onChange={e => setForm({ ...form, date_of_birth: e.target.value })} /><button type='button' className='btn' onClick={()=>setForm({ ...form, date_of_birth: '' })}>Unknown</button></div></label>
        <label className='records-field'><span>Acquisition date</span><input className='input' type='date' value={form.acquisition_date} onChange={e => setForm({ ...form, acquisition_date: e.target.value })} /></label>
        <label className='records-field'><span>Purchased from</span><input className='input' list='livestock-purchase-sources-create' placeholder='Breeder / market / seller' value={form.purchased_from} onChange={e => setForm({ ...form, purchased_from: e.target.value })} /></label>
        <label className='records-field'><span>Source type</span><select className='input' value={form.purchased_from_type} onChange={e => setForm({ ...form, purchased_from_type: e.target.value })}><option value='BREEDER'>Breeder</option><option value='MARKET'>Market</option><option value='FARM'>Farm</option><option value='OTHER'>Other</option></select></label>
        {!recordsSectionOpen.edit && <datalist id='livestock-purchase-sources-create'>{state.livestockPurchaseSources.filter(s => !s.species || s.species === 'ALL' || s.species === form.species).map(s => <option key={`create-source-${s.id}-${s.name}`} value={s.name}>{s.source_type || ''}</option>)}</datalist>}
        <label className='records-field'><span>Purchase price</span><input className='input' inputMode='decimal' placeholder='0.00' value={form.purchase_price} onChange={e => setForm({ ...form, purchase_price: e.target.value })} /></label>
        <label className='records-field'><span>Currency</span><input className='input' placeholder='GHS' value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} /></label>
        <label className='records-field'><span>Stars</span><select className='input' value={form.stars} onChange={e => setForm({ ...form, stars: e.target.value })}><option value='0'>0 stars</option><option value='1'>1 star</option><option value='2'>2 stars</option><option value='3'>3 stars</option><option value='4'>4 stars</option><option value='5'>5 stars</option></select></label>
        <label className='records-field'><span>Initial weight (kg)</span><input className='input' inputMode='decimal' placeholder='0' value={form.initial_weight_kg} onChange={e => setForm({ ...form, initial_weight_kg: e.target.value })} /></label>
        <label className='records-field'><span>Litter size</span><input className='input' inputMode='numeric' placeholder='1' value={form.litter_size} onChange={e => setForm({ ...form, litter_size: e.target.value })} /></label>
        <label className='records-field'><span>Breeding type</span><input className='input' placeholder='Natural / AI / Embryo' value={form.breeding_type} onChange={e => setForm({ ...form, breeding_type: e.target.value })} /></label>
        <label className='records-field'><span>Health status</span><input className='input' placeholder='Healthy / Monitor / Treated' value={form.health_status} onChange={e => setForm({ ...form, health_status: e.target.value })} /></label>
        <label className='records-field'><span>Pen / location</span><input className='input' placeholder='Pen A / Pasture 3' value={form.pen_location} onChange={e => setForm({ ...form, pen_location: e.target.value })} /></label>
        <label className='records-field'><span>Farm / maternal line ref</span><input className='input' placeholder='Farm ID / maternal grandsire' value={form.farm_id} onChange={e => setForm({ ...form, farm_id: e.target.value })} /></label>
        <label className='records-field'><span>Sire ID</span><input className='input' placeholder='Sire record ID' value={form.sire_id} onChange={e => setForm({ ...form, sire_id: e.target.value })} /></label>
        <label className='records-field'><span>Dam ID</span><input className='input' placeholder='Dam record ID' value={form.dam_id} onChange={e => setForm({ ...form, dam_id: e.target.value })} /></label>
        <label className='records-field'><span>Cull / keep</span><select className='input' value={form.cull_keep_status} onChange={e => setForm({ ...form, cull_keep_status: e.target.value })}><option value='KEEP'>Keep</option><option value='CULL'>Cull</option><option value='SOLD'>Sold</option><option value='DIED'>Died</option></select></label>
        <label className='records-field'><span>Cull reason</span><input className='input' placeholder='Low performance / health / age' value={form.cull_reason} onChange={e => setForm({ ...form, cull_reason: e.target.value })} /></label>
        <label className='records-field'><span>Castrated</span><select className='input' value={form.castrated ? 'YES' : 'NO'} onChange={e => setForm({ ...form, castrated: e.target.value === 'YES' })}><option value='NO'>No</option><option value='YES'>Yes</option></select></label>
        <label className='records-field'><span>Sale date</span><input className='input' type='date' value={form.sale_date} onChange={e => setForm({ ...form, sale_date: e.target.value })} /></label>
        <label className='records-field'><span>Sale price</span><input className='input' inputMode='decimal' placeholder='0.00' value={form.sale_price} onChange={e => setForm({ ...form, sale_price: e.target.value })} /></label>
        <label className='records-field'><span>Sold to</span><input className='input' placeholder='Buyer / market / processor' value={form.sold_to} onChange={e => setForm({ ...form, sold_to: e.target.value })} /></label>
        <label className='records-field'><span>Died date</span><input className='input' type='date' value={form.died_date} onChange={e => setForm({ ...form, died_date: e.target.value })} /></label>
        <label className='records-field records-field-wide'><span>Medicine / treatment note</span><input className='input' placeholder='Initial medicine, dosage, or treatment note' value={form.treatment_entry} onChange={e => setForm({ ...form, treatment_entry: e.target.value })} /></label>
        <label className='records-field records-field-wide'><span>Draft attachments</span><div style={{display:'grid', gap:8}}><div className='row2' style={{gap:10}}><label className='upload-field'><span className='helper-text'>Animal photos</span><input type='file' accept='image/*' multiple onChange={e => { handleAnimalPhotoFiles(e.target.files).catch(console.error); e.target.value = '' }} /></label><label className='upload-field'><span className='helper-text'>Animal documents</span><input type='file' multiple onChange={e => { handleAnimalDocFiles(e.target.files); e.target.value = '' }} /></label></div><div className='helper-text'>{animalUploads.photos.length} photo(s) · {animalUploads.docs.length} document(s) selected.</div>{!!animalUploads.photos.length && <div className='helper-text'>Photos: {animalUploads.photos.map(file => file.name).join(', ')}</div>}{!!animalUploads.docs.length && <div className='helper-text'>Docs: {animalUploads.docs.map(file => file.name).join(', ')}</div>}</div></label>
        <label className='records-field records-field-wide'><span>Notes</span><textarea className='input' rows='4' placeholder='Anything useful about lineage, treatment, temperament, or special handling.' value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
       </>
      })()}
      <div className='records-form-actions'>
       <button type='button' className='btn' onClick={() => setRecordsSectionOpen(prev => ({ ...prev, create: false, edit: false, details: !!currentLivestockRecord }))}>Cancel</button>
       <button type='submit' className='btn btn-dark'>{busyLabel(recordsSectionOpen.edit ? 'livestock-edit' : 'livestock-create', recordsSectionOpen.edit ? 'Save changes' : 'Create record')}</button>
      </div>
     </form>
    </article>}

    {!recordsSectionOpen.create && !recordsSectionOpen.edit && currentLivestockRecord && <article className='panel records-panel records-detail-panel' style={{position:'fixed', inset:0, zIndex:220, margin:0, borderRadius:0, overflow:'auto', background:'#f8fafc', padding:'16px 12px 28px'}}>
     <div className='records-detail-hero'>
      <div>
       <div className='records-detail-kicker'>{currentLivestockRecord.species || 'Animal'} · {currentLivestockRecord.animal_type || 'Profile'}</div>
       <h4>{currentLivestockRecord.name || `Animal ${currentLivestockRecord.id || ''}`}</h4>
       <p>{currentLivestockRecord.pen_location || currentLivestockRecord.purchased_from || 'No pen or source recorded yet'}</p>
      </div>
      <div className='records-detail-actions'>
       <button type='button' className='btn' onClick={() => { if (selectedOffspringRecord) setSelectedOffspringRecord(null); else { setSelectedLivestockRecord(null); setRecordsSectionOpen(prev => ({ ...prev, details: false })) } }}>Back</button>
       <button type='button' className='btn btn-dark' onClick={() => { setLivestockRecordEdit(mapLivestockRecordToEditForm(currentLivestockRecord)); setRecordsSectionOpen(prev => ({ ...prev, edit: true, create: false, details: false })) }}>Edit</button>
      </div>
     </div>

     <div className='records-detail-grid'>
      {livestockDetailRows(currentLivestockRecord).map((row, idx) => {
       const [label, value, action] = row
       const clickable = action === 'breeder' && value && value !== '--'
       return <button type='button' key={`detail-${label}-${idx}`} className={`records-detail-row ${clickable ? 'clickable' : ''}`} onClick={() => {
        if (!clickable) return
        setBreederUploads({ photos: [], docs: [] })
        setSelectedBreederDetail({ id: String(currentLivestockRecord?.id || '0001').padStart(4,'0'), name: value, phone: '--', email: '--', address: '--', scrapiePrefix: '--', notes: '--' })
       }}>
        <span>{label}</span>
        <strong>{value == null || value === '' ? '--' : String(value)}</strong>
       </button>
      })}
     </div>

     {(() => {
      const attachmentMeta = extractAttachmentsFromNotes(currentLivestockRecord?.notes)
      if (!(attachmentMeta.photos || []).length && !(attachmentMeta.docs || []).length) return null
      return <>
       <div className='records-detail-section'>Attachments</div>
       <div className='records-detail-grid'>
        {(attachmentMeta.photos || []).map((photo, idx)=><div key={`record-photo-${idx}`} className='records-detail-row' style={{display:'grid', gap:8}}><span>{photo?.name || `Photo ${idx+1}`}</span>{photo?.data_url ? <img src={photo.data_url} alt={photo?.name || `Animal photo ${idx+1}`} style={{width:'100%', maxHeight:220, objectFit:'cover', borderRadius:10}} /> : <strong>Image saved</strong>}</div>)}
        {(attachmentMeta.docs || []).map((doc, idx)=><div key={`record-doc-${idx}`} className='records-detail-row'><span>Document</span><strong>{doc?.name || `Document ${idx+1}`}</strong></div>)}
       </div>
      </>
     })()}

     {(() => {
      const at = extractAttachmentsFromNotes(currentLivestockRecord?.notes)
      if (!at.photos.length && !at.docs.length) return null
      return <>
       <div className='records-detail-section'>Attachments</div>
       <div className='panel' style={{background:'#fff', border:'1px solid #dbe6df', marginBottom:10}}>
        {!!at.photos.length && <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))',gap:8}}>{at.photos.map((p, idx)=><button type='button' key={`animal-photo-${idx}`} className='btn' style={{padding:0,overflow:'hidden',height:120}} onClick={()=>{ const url = p?.data_url || p?.url || ''; if (url) setLightbox({ open:true, images:[url], index:0, title:p?.name || 'Animal photo' }) }}>{(p?.data_url || p?.url) ? <img src={p.data_url || p.url} alt={p?.name || 'Animal photo'} style={{width:'100%',height:'100%',objectFit:'cover'}} /> : <span style={{padding:8}}>{p?.name || `Photo ${idx+1}`}</span>}</button>)}</div>}
        {!!at.docs.length && <div className='list' style={{marginTop:10}}>{at.docs.map((d, idx)=><div key={`animal-doc-${idx}`} className='list-row'><span>{d?.name || `Document ${idx+1}`}</span></div>)}</div>}
       </div>
      </>
     })()}

     <div className='records-detail-section'>History</div>
     <div className='records-detail-grid'>
      {livestockHistoryRows(currentLivestockRecord).history.map((row, idx) => {
       const [label, value, action] = row
       const clickable = action === 'notes' || action === 'add-note' || action === 'add-weight' || action === 'medicines' || action === 'add-medicine' || action === 'famacha' || action === 'ancestor-tree' || action === 'share-pdf' || action === 'offspring-report' || action === 'offspring-list' || action === 'add-mark' || action === 'add-flush'
       return <button type='button' key={`history-${label}-${idx}`} className={`records-detail-row ${clickable ? 'clickable' : ''}`} onClick={() => {
        if (action === 'notes') setNotesScreenOpen(true)
        if (action === 'add-note') { setDraftNote(''); setNotesComposerOpen(true) }
        if (action === 'add-weight') { setDraftWeight(''); setWeightComposerOpen(true) }
        if (action === 'medicines') setMedicinesScreenOpen(true)
        if (action === 'add-medicine') { setMedicineShotDraft({ medicine: '', dosage: '', notes: '' }); setMedicineShotOpen(true) }
        if (action === 'share-pdf') setAncestorPdfOpen(true)
        if (action === 'famacha') { setFamachaDraft({ famacha: '--', bodyScore: '', weight: '', notes: '' }); setFamachaComposerOpen(true) }
        if (action === 'ancestor-tree') setAncestorTreeOpen(true)
        if (action === 'offspring-report') setOffspringReportOpen(true)
        if (action === 'offspring-list') setOffspringListOpen(true)
        if (action === 'add-mark') setMarkDraft({ sire: currentLivestockRecord?.sire_id || '', dam: currentLivestockRecord?.dam_id || currentLivestockRecord?.id || '', markDate: new Date().toISOString().slice(0,10), dueDate: '2026-08-26', fertilizationType: 'Natural' })
        if (action === 'add-mark') setMarkComposerOpen(true)
        if (action === 'add-flush') setFlushDraft({ ram: currentLivestockRecord?.sire_id || '', date: new Date().toISOString().slice(0,10), cidrIn: '', cidrOut: '', notes: '' })
        if (action === 'add-flush') setFlushComposerOpen(true)
       }}>
        <span>{label}</span>
        <strong>{String(value).startsWith('(') ? '›' : value}</strong>
       </button>
      })}
     </div>

     <div className='records-detail-section'>Offspring</div>
     <div className='records-detail-grid'>
      {livestockHistoryRows(currentLivestockRecord).offspring.map(([label, value], idx) => {
       const action = value === 'add-lamb'
       return <button type='button' key={`offspring-${label}-${idx}`} className={`records-detail-row ${action ? 'clickable' : ''}`} onClick={() => {
        if (!action) return
        const draft = buildOffspringDraftFromParent(currentLivestockRecord)
        if (draft) setLivestockRecordForm(draft)
        setRecordsSectionOpen(prev => ({ ...prev, create: true, edit: false, details: false }))
       }}>
        <span>{label}</span>
        <strong>{String(value).startsWith('(') ? '›' : value}</strong>
       </button>
      })}
     </div>
    </article>}

    {!recordsSectionOpen.create && !recordsSectionOpen.edit && !currentLivestockRecord && <article className='panel records-panel records-empty-detail'>
     <div className='records-empty-icon'>🐑</div>
     <h4>Select a record</h4>
     <p>Pick any animal from the record home to view its details, health history, offspring shortcuts, and edit actions.</p>
     <button type='button' className='btn btn-dark' onClick={() => setRecordsSectionOpen(prev => ({ ...prev, create: true, edit: false, details: false }))}>Create new animal</button>
    </article>}
   </div>
  </div>
 </div>
</section>}

 {active === 'services' && <section>
 <div className='section-header'>
 <div>
 <h3>{t('Services','Services','服务')}</h3>
 <p className='helper-text'>Use separate create/list/edit flows. Service listings support up to 20 images.</p>
 </div>
 <button className='btn btn-dark' type='button' onClick={() => setServicesView('create')}>Add New Service</button>
 </div>
 <div className='tabs compact-tabs'>
 <button className={`tab ${servicesView === 'list' ? 'active' : ''}`} onClick={() => setServicesView('list')}>Service Lists</button>
 <button className={`tab ${servicesView === 'create' ? 'active' : ''}`} onClick={() => setServicesView('create')}>Create Service</button>
 <button className={`tab ${servicesView === 'edit' ? 'active' : ''}`} onClick={() => setServicesView('edit')}>Edit Service</button>
 </div>

 {servicesView === 'create' && <div className='three-col'>
 <article className='panel'><h4>Logistics Request</h4><form className='list' onSubmit={async e => { e.preventDefault(); await api.createLogistics({ ...logisticsForm, ...normalizeListingImages(serviceImages), requester_id: Number(logisticsForm.requester_id), weight_kg: Number(logisticsForm.weight_kg) }); setServiceImages([]); await load(); setServicesView('list') }}>
 <input className='input' placeholder='Pickup' value={logisticsForm.pickup_location} onChange={e => setLogisticsForm({ ...logisticsForm, pickup_location: e.target.value })} />
 <input className='input' placeholder='Dropoff' value={logisticsForm.dropoff_location} onChange={e => setLogisticsForm({ ...logisticsForm, dropoff_location: e.target.value })} />
 <input className='input' placeholder='Cargo type' value={logisticsForm.cargo_type} onChange={e => setLogisticsForm({ ...logisticsForm, cargo_type: e.target.value })} />
 <input className='input' placeholder='Weight kg' value={logisticsForm.weight_kg} onChange={e => setLogisticsForm({ ...logisticsForm, weight_kg: e.target.value })} />
 <ListingImagePicker label='Service photos' limit={MAX_IMAGE_COUNTS.services} images={serviceImages} setImages={setServiceImages} />
 <button className='btn btn-dark'>Create Logistics</button>
 </form></article>
 <article className='panel'><h4>Equipment Rental</h4><form className='list' onSubmit={async e => { e.preventDefault(); await api.createEquipment({ ...equipmentForm, ...normalizeListingImages(serviceImages), requester_id: Number(equipmentForm.requester_id), duration_days: Number(equipmentForm.duration_days), budget: Number(equipmentForm.budget) }); setServiceImages([]); await load(); setServicesView('list') }}>
 <input className='input' placeholder='Equipment' value={equipmentForm.equipment_type} onChange={e => setEquipmentForm({ ...equipmentForm, equipment_type: e.target.value })} />
 <input className='input' placeholder='Duration days' value={equipmentForm.duration_days} onChange={e => setEquipmentForm({ ...equipmentForm, duration_days: e.target.value })} />
 <input className='input' placeholder='Location' value={equipmentForm.location} onChange={e => setEquipmentForm({ ...equipmentForm, location: e.target.value })} />
 <input className='input' placeholder='Budget' value={equipmentForm.budget} onChange={e => setEquipmentForm({ ...equipmentForm, budget: e.target.value })} />
 <ListingImagePicker label='Service photos' limit={MAX_IMAGE_COUNTS.services} images={serviceImages} setImages={setServiceImages} />
 <button className='btn btn-dark'>Create Rental</button>
 </form></article>
 <article className='panel'><h4>Storage Reservation</h4><form className='list' onSubmit={async e => { e.preventDefault(); await api.createStorage({ ...storageForm, ...normalizeListingImages(serviceImages), requester_id: Number(storageForm.requester_id), duration_days: Number(storageForm.duration_days), quantity_kg: Number(storageForm.quantity_kg) }); setServiceImages([]); await load(); setServicesView('list') }}>
 <input className='input' placeholder='Storage type' value={storageForm.storage_type} onChange={e => setStorageForm({ ...storageForm, storage_type: e.target.value })} />
 <input className='input' placeholder='Quantity kg' value={storageForm.quantity_kg} onChange={e => setStorageForm({ ...storageForm, quantity_kg: e.target.value })} />
 <input className='input' placeholder='Location' value={storageForm.location} onChange={e => setStorageForm({ ...storageForm, location: e.target.value })} />
 <input className='input' placeholder='Duration days' value={storageForm.duration_days} onChange={e => setStorageForm({ ...storageForm, duration_days: e.target.value })} />
 <ListingImagePicker label='Service photos' limit={MAX_IMAGE_COUNTS.services} images={serviceImages} setImages={setServiceImages} />
 <button className='btn btn-dark'>Create Storage</button>
 </form></article>
 </div>}

 {servicesView === 'edit' && <div className='three-col'>
 <article className='panel'><h4>Edit Logistics</h4><form className='list' onSubmit={async e => { e.preventDefault(); await api.updateLogistics(Number(logisticsEdit.id), { ...logisticsEdit, ...normalizeListingImages(serviceEditImages), requester_id: Number(logisticsEdit.requester_id), weight_kg: Number(logisticsEdit.weight_kg) }); await load(); setServicesView('list') }}>
 <input className='input' placeholder='ID to edit' value={logisticsEdit.id} onChange={e => setLogisticsEdit({ ...logisticsEdit, id: e.target.value })} required />
 <input className='input' placeholder='Pickup' value={logisticsEdit.pickup_location} onChange={e => setLogisticsEdit({ ...logisticsEdit, pickup_location: e.target.value })} />
 <input className='input' placeholder='Dropoff' value={logisticsEdit.dropoff_location} onChange={e => setLogisticsEdit({ ...logisticsEdit, dropoff_location: e.target.value })} />
 <ListingImagePicker label='Service photos' limit={MAX_IMAGE_COUNTS.services} images={serviceEditImages} setImages={setServiceEditImages} />
 <button className='btn btn-dark'>Save Logistics</button>
 </form></article>
 <article className='panel'><h4>Edit Equipment</h4><form className='list' onSubmit={async e => { e.preventDefault(); await api.updateEquipment(Number(equipmentEdit.id), { ...equipmentEdit, ...normalizeListingImages(serviceEditImages), requester_id: Number(equipmentEdit.requester_id), duration_days: Number(equipmentEdit.duration_days), budget: Number(equipmentEdit.budget) }); await load(); setServicesView('list') }}>
 <input className='input' placeholder='ID to edit' value={equipmentEdit.id} onChange={e => setEquipmentEdit({ ...equipmentEdit, id: e.target.value })} required />
 <input className='input' placeholder='Equipment' value={equipmentEdit.equipment_type} onChange={e => setEquipmentEdit({ ...equipmentEdit, equipment_type: e.target.value })} />
 <input className='input' placeholder='Location' value={equipmentEdit.location} onChange={e => setEquipmentEdit({ ...equipmentEdit, location: e.target.value })} />
 <ListingImagePicker label='Service photos' limit={MAX_IMAGE_COUNTS.services} images={serviceEditImages} setImages={setServiceEditImages} />
 <button className='btn btn-dark'>Save Equipment</button>
 </form></article>
 <article className='panel'><h4>Edit Storage</h4><form className='list' onSubmit={async e => { e.preventDefault(); await api.updateStorage(Number(storageEdit.id), { ...storageEdit, ...normalizeListingImages(serviceEditImages), requester_id: Number(storageEdit.requester_id), duration_days: Number(storageEdit.duration_days), quantity_kg: Number(storageEdit.quantity_kg) }); await load(); setServicesView('list') }}>
 <input className='input' placeholder='ID to edit' value={storageEdit.id} onChange={e => setStorageEdit({ ...storageEdit, id: e.target.value })} required />
 <input className='input' placeholder='Storage type' value={storageEdit.storage_type} onChange={e => setStorageEdit({ ...storageEdit, storage_type: e.target.value })} />
 <input className='input' placeholder='Location' value={storageEdit.location} onChange={e => setStorageEdit({ ...storageEdit, location: e.target.value })} />
 <ListingImagePicker label='Service photos' limit={MAX_IMAGE_COUNTS.services} images={serviceEditImages} setImages={setServiceEditImages} />
 <button className='btn btn-dark'>Save Storage</button>
 </form></article>
 </div>}

 {servicesView === 'list' && <div className='three-col'>
 <article className='panel'><h4>Logistics Requests</h4>{!state.logistics.length ? <EmptyListingsState title='No logistics services yet' body='Create your first logistics request or transport service listing.' actionLabel='Add Logistics Service' onAction={() => setServicesView('create')} /> : <div className='list'>
 {state.logistics.map((r) => { const images = parseImageList(r.image_urls); return <ListingDetailCard key={`log-${r.id}`} title={`${r.pickup_location} → ${r.dropoff_location}`} subtitle={`${r.cargo_type || 'General cargo'} • ${r.status}`} stats={[`${r.weight_kg || 0} kg`, `${images.length} photos`]} contact={r.contact_name || r.phone || `Requester #${r.requester_id || '—'}`}><ListingGallery images={images.length ? images : [r.cover_image_url].filter(Boolean)} title={`Logistics ${r.id}`} onOpen={(imgs, index, title) => setLightbox({ open: true, images: imgs, index, title })} /><div className='card-actions'><button className='btn btn-dark' type='button' onClick={() => { setLogisticsEdit({ id: r.id, requester_id: r.requester_id || 1, pickup_location: r.pickup_location || '', dropoff_location: r.dropoff_location || '', cargo_type: r.cargo_type || '', weight_kg: r.weight_kg || '', status: r.status || 'PENDING' }); setServiceEditImages(images); setServicesView('edit') }}>Edit</button><button className='btn' type='button' onClick={() => setSavedListings(prev => isSavedListing(prev, 'logistics', r.id) ? prev.filter(x => x !== listingKey('logistics', r.id)) : [...prev, listingKey('logistics', r.id)])}>{isSavedListing(savedListings, 'logistics', r.id) ? 'Saved ✓' : 'Save'}</button><button className='btn' type='button' onClick={async () => { try { await navigator.share?.({ title: `${r.pickup_location} → ${r.dropoff_location}`, text: r.cargo_type || 'Logistics service', url: window.location.href }) } catch {} }}>Share</button><button className='btn' type='button' onClick={() => openOrderFromListing({ me, setActive, setOrderForm, listingType: 'LOGISTICS', listingId: r.id, listingTitle: `${r.pickup_location} to ${r.dropoff_location}`, sellerId: r.requester_id, unitPrice: r.weight_kg || 0, quantity: 1 })}>Contact via FarmSavior</button><button className='btn' type='button' onClick={() => openOrderFromListing({ me, setActive, setOrderForm, listingType: 'LOGISTICS', listingId: r.id, listingTitle: `${r.pickup_location} to ${r.dropoff_location}`, sellerId: r.requester_id, unitPrice: r.weight_kg || 0, quantity: 1 })}>Send Inquiry</button><button className='btn' type='button' onClick={async () => { if (!window.confirm(`Delete logistics service #${r.id}?`)) return; await api.deleteLogistics(r.id); await load() }}>Delete</button></div></ListingDetailCard> })}
 </div>}</article>
 <article className='panel'><h4>Equipment Rentals</h4>{!state.equipment.length ? <EmptyListingsState title='No equipment rentals yet' body='Create your first machinery or equipment rental service.' actionLabel='Add Equipment Service' onAction={() => setServicesView('create')} /> : <div className='list'>
 {state.equipment.map((r) => { const images = parseImageList(r.image_urls); return <ListingDetailCard key={`eq-${r.id}`} title={r.equipment_type} subtitle={`${r.location || 'Location not set'} • ${r.status}`} stats={[`${r.duration_days} days`, `${r.budget} budget`, `${images.length} photos`]} contact={r.contact_name || r.phone || `Requester #${r.requester_id || '—'}`}><ListingGallery images={images.length ? images : [r.cover_image_url].filter(Boolean)} title={`Equipment ${r.id}`} onOpen={(imgs, index, title) => setLightbox({ open: true, images: imgs, index, title })} /><div className='card-actions'><button className='btn btn-dark' type='button' onClick={() => { setEquipmentEdit({ id: r.id, requester_id: r.requester_id || 1, equipment_type: r.equipment_type || '', duration_days: r.duration_days || '', location: r.location || '', budget: r.budget || '', status: r.status || 'PENDING' }); setServiceEditImages(images); setServicesView('edit') }}>Edit</button><button className='btn' type='button' onClick={() => setSavedListings(prev => isSavedListing(prev, 'equipment', r.id) ? prev.filter(x => x !== listingKey('equipment', r.id)) : [...prev, listingKey('equipment', r.id)])}>{isSavedListing(savedListings, 'equipment', r.id) ? 'Saved ✓' : 'Save'}</button><button className='btn' type='button' onClick={async () => { try { await navigator.share?.({ title: r.equipment_type, text: r.location || 'Equipment service', url: window.location.href }) } catch {} }}>Share</button><button className='btn' type='button' onClick={() => openOrderFromListing({ me, setActive, setOrderForm, listingType: 'LOGISTICS', listingId: r.id, listingTitle: `${r.pickup_location} to ${r.dropoff_location}`, sellerId: r.requester_id, unitPrice: r.budget || r.weight_kg || 0, quantity: 1 })}>Contact via FarmSavior</button><button className='btn' type='button' onClick={() => openOrderFromListing({ me, setActive, setOrderForm, listingType: 'LOGISTICS', listingId: r.id, listingTitle: `${r.pickup_location} to ${r.dropoff_location}`, sellerId: r.requester_id, unitPrice: r.budget || r.weight_kg || 0, quantity: 1 })}>Send Inquiry</button><button className='btn' type='button' onClick={async () => { if (!window.confirm(`Delete equipment service #${r.id}?`)) return; await api.deleteEquipment(r.id); await load() }}>Delete</button></div></ListingDetailCard> })}
 </div>}</article>
 <article className='panel'><h4>Storage Reservations</h4>{!state.storage.length ? <EmptyListingsState title='No storage services yet' body='Create your first storage or cold-room service listing.' actionLabel='Add Storage Service' onAction={() => setServicesView('create')} /> : <div className='list'>
 {state.storage.map((r) => { const images = parseImageList(r.image_urls); return <ListingDetailCard key={`st-${r.id}`} title={r.storage_type} subtitle={`${r.location || 'Location not set'} • ${r.status}`} stats={[`${r.quantity_kg} kg`, `${r.duration_days} days`, `${images.length} photos`]} contact={r.contact_name || r.phone || `Requester #${r.requester_id || '—'}`}><ListingGallery images={images.length ? images : [r.cover_image_url].filter(Boolean)} title={`Storage ${r.id}`} onOpen={(imgs, index, title) => setLightbox({ open: true, images: imgs, index, title })} /><div className='card-actions'><button className='btn btn-dark' type='button' onClick={() => { setStorageEdit({ id: r.id, requester_id: r.requester_id || 1, storage_type: r.storage_type || '', quantity_kg: r.quantity_kg || '', location: r.location || '', duration_days: r.duration_days || '', status: r.status || 'PENDING' }); setServiceEditImages(images); setServicesView('edit') }}>Edit</button><button className='btn' type='button' onClick={() => setSavedListings(prev => isSavedListing(prev, 'storage', r.id) ? prev.filter(x => x !== listingKey('storage', r.id)) : [...prev, listingKey('storage', r.id)])}>{isSavedListing(savedListings, 'storage', r.id) ? 'Saved ✓' : 'Save'}</button><button className='btn' type='button' onClick={async () => { try { await navigator.share?.({ title: r.storage_type, text: r.location || 'Storage service', url: window.location.href }) } catch {} }}>Share</button><button className='btn' type='button' onClick={() => openOrderFromListing({ me, setActive, setOrderForm, listingType: 'LOGISTICS', listingId: r.id, listingTitle: `${r.pickup_location} to ${r.dropoff_location}`, sellerId: r.requester_id, unitPrice: r.budget || r.weight_kg || 0, quantity: 1 })}>Contact via FarmSavior</button><button className='btn' type='button' onClick={() => openOrderFromListing({ me, setActive, setOrderForm, listingType: 'LOGISTICS', listingId: r.id, listingTitle: `${r.pickup_location} to ${r.dropoff_location}`, sellerId: r.requester_id, unitPrice: r.budget || r.weight_kg || 0, quantity: 1 })}>Send Inquiry</button><button className='btn' type='button' onClick={async () => { if (!window.confirm(`Delete storage service #${r.id}?`)) return; await api.deleteStorage(r.id); await load() }}>Delete</button></div></ListingDetailCard> })}
 </div>}</article>
 </div>}
 </section>}

 {active === 'payments' && <section><h3>{t('Payments & Escrow','Paiements et séquestre','支付和托管')}</h3><div className='panel' style={{marginBottom:12}}><strong>Order updates</strong><div className='list' style={{marginTop:8}}>{state.notifications.slice(0,6).map((n) => <div key={`note-${n.id}`} className='list-row'><span><strong>{n.title}</strong><br /><span className='helper-text'>{n.message}</span></span></div>)}{!state.notifications.length && <div className='helper-text' style={{marginTop:8}}>No notifications yet.</div>}</div></div>
 <div className='three-col'>
 <article className='panel'><h4>Seller Payout Settings</h4><form className='list' onSubmit={async e => { e.preventDefault(); await api.savePayoutProfile({ ...payoutForm, user_id: Number(payoutForm.user_id) }); await load() }}>
 <div className='row2' style={{gap:10}}><input className='input' value='Your payout profile' readOnly /><input className='input' placeholder='Country' value={payoutForm.country} onChange={e => setPayoutForm({ ...payoutForm, country: e.target.value })} /></div>
 <div className='row2' style={{gap:10}}><input className='input' placeholder='Payout method' value={payoutForm.payout_method} onChange={e => setPayoutForm({ ...payoutForm, payout_method: e.target.value })} /><input className='input' placeholder='Account name' value={payoutForm.account_name} onChange={e => setPayoutForm({ ...payoutForm, account_name: e.target.value })} /></div>
 <div className='row2' style={{gap:10}}><input className='input' placeholder='Bank name' value={payoutForm.bank_name} onChange={e => setPayoutForm({ ...payoutForm, bank_name: e.target.value })} /><input className='input' placeholder='Account number' value={payoutForm.account_number} onChange={e => setPayoutForm({ ...payoutForm, account_number: e.target.value })} /></div>
 <div className='row2' style={{gap:10}}><input className='input' placeholder='MoMo provider' value={payoutForm.mobile_money_provider} onChange={e => setPayoutForm({ ...payoutForm, mobile_money_provider: e.target.value })} /><input className='input' placeholder='MoMo number' value={payoutForm.mobile_money_number} onChange={e => setPayoutForm({ ...payoutForm, mobile_money_number: e.target.value })} /></div>
 <button className='btn btn-dark'>Save Seller Payout Method</button>
 </form></article>
 <article className='panel'><h4>Create Escrow Order</h4><p className='helper-text'>Listing buttons now prefill this form automatically for the signed-in buyer.</p><form className='list' onSubmit={async e => { e.preventDefault(); await api.createOrder({ ...orderForm, buyer_id: Number(orderForm.buyer_id), seller_id: Number(orderForm.seller_id), listing_id: Number(orderForm.listing_id), quantity: Number(orderForm.quantity), unit_price: Number(orderForm.unit_price) }); await load() }}>
 <div className='row2' style={{gap:10}}><input className='input' placeholder='Listing title' value={orderForm.listing_title} onChange={e => setOrderForm({ ...orderForm, listing_title: e.target.value })} required /><input className='input' placeholder='Listing type' value={orderForm.listing_type} onChange={e => setOrderForm({ ...orderForm, listing_type: e.target.value })} /></div>
 <div className='row2' style={{gap:10}}><input className='input' value='Buyer captured from signed-in account' readOnly /><input className='input' value='Seller captured from listing owner' readOnly /></div>
 <div className='row2' style={{gap:10}}><input className='input' placeholder='Listing ID' value={orderForm.listing_id} onChange={e => setOrderForm({ ...orderForm, listing_id: e.target.value })} /><input className='input' placeholder='Quantity' value={orderForm.quantity} onChange={e => setOrderForm({ ...orderForm, quantity: e.target.value })} /></div>
 <div className='row2' style={{gap:10}}><input className='input' placeholder='Unit price' value={orderForm.unit_price} onChange={e => setOrderForm({ ...orderForm, unit_price: e.target.value })} required /><input className='input' placeholder='Delivery method' value={orderForm.delivery_method} onChange={e => setOrderForm({ ...orderForm, delivery_method: e.target.value })} /></div>
 <input className='input' placeholder='Buyer note' value={orderForm.buyer_note} onChange={e => setOrderForm({ ...orderForm, buyer_note: e.target.value })} />
 <button className='btn btn-dark'>Create Escrow Order</button>
 </form></article>
 <article className='panel'><h4>Admin Payout Queue</h4>{!state.payoutProfiles.length ? <EmptyListingsState title='No payout methods saved yet' body='Sellers need a verified bank or mobile money payout method before release.' /> : <div className='list'>{state.payoutProfiles.map((p) => <ListingDetailCard key={`payout-${p.id}`} title={`${p.account_name} (#${p.user_id})`} subtitle={`${p.payout_method} • ${p.country} • ${p.verification_status}`} stats={[p.bank_name || p.mobile_money_provider || 'Payout method', p.account_number || p.mobile_money_number || '']} contact={p.is_verified ? 'Verified payout method' : 'Awaiting verification'}><div className='card-actions'><button className='btn btn-dark' type='button' onClick={async () => { const res = await api.verifyPayoutProfile(p.user_id, { is_verified: true, verification_status: 'VERIFIED' }); await load(); if (res?.verification_status === 'RECIPIENT_SETUP_FAILED') alert(res?.recipient_last_status || 'Recipient setup failed') }}>Verify</button></div></ListingDetailCard>)}</div>}</article>
 </div>

 <div className='three-col' style={{marginTop:12}}>
 <article className='panel'><h4>Buyer Order Page</h4><input className='input filter' placeholder='View orders for this buyer account' value={buyerOrderUserId} onChange={e => setBuyerOrderUserId(e.target.value)} />
 <div className='list'>
 {state.orders.filter(o => String(o.buyer_id) === String(buyerOrderUserId)).map((o) => <ListingDetailCard key={`buyer-${o.id}`} title={`${o.listing_title} • Order ${o.id}`} subtitle={`Escrow ${o.escrow_status} • Fulfillment ${o.fulfillment_status}`} stats={[`${o.gross_amount} ${o.currency}`, `seller net ${o.seller_net}`, `ref ${o.payment_reference || '—'}`]} contact={'Seller protected by FarmSavior escrow'}><div className='card-actions'><button className='btn btn-dark' type='button' onClick={async () => { const res = await api.payOrder(o.id, { ...orderPayment, payer_id: o.buyer_id, payee_id: o.seller_id, amount: o.gross_amount }); const url = res?.payment?.authorization_url; if (url) window.open(url, '_blank', 'noopener,noreferrer'); await load() }}>Pay Securely</button><button className='btn' type='button' onClick={async () => { try { await api.verifyOrderPayment(o.id); await load() } catch (err) { alert(err?.response?.data?.detail || 'Payment not verified yet') } }}>Verify Payment</button><button className='btn' type='button' onClick={async () => { await api.confirmOrder(o.id); await load() }}>Confirm Receipt</button><button className='btn' type='button' onClick={async () => { await api.disputeOrder(o.id, { buyer_note: 'Buyer dispute submitted from dashboard' }); await load() }}>Open Dispute</button><button className='btn' type='button' onClick={async () => { const order = await api.fetchOrder(o.id); setSelectedOrder(order) }}>View Order</button><button className='btn' type='button' onClick={async () => { const receipt = await api.fetchOrderReceipt(o.id); setSelectedReceipt(receipt) }}>Receipt</button><button className='btn' type='button' onClick={async () => { await api.refundOrder(o.id, { buyer_note: 'Buyer refund requested from dashboard' }); await load() }}>Request Refund</button></div></ListingDetailCard>)}
 {!state.orders.filter(o => String(o.buyer_id) === String(buyerOrderUserId)).length && <EmptyListingsState title='No buyer orders yet' body='Buyer orders will appear here with escrow, payment, and dispute controls.' />}
 </div>
 </article>

 <article className='panel'><h4>Seller Order Dashboard</h4><input className='input filter' placeholder='View orders for this seller account' value={sellerOrderUserId} onChange={e => setSellerOrderUserId(e.target.value)} />
 <div className='list'>
 {state.orders.filter(o => String(o.seller_id) === String(sellerOrderUserId)).map((o) => <ListingDetailCard key={`seller-${o.id}`} title={`${o.listing_title} • Order ${o.id}`} subtitle={`Escrow ${o.escrow_status} • Payout ${o.payout_status}`} stats={[`${o.quantity} qty`, `${o.gross_amount} ${o.currency}`, `${o.fulfillment_status}`]} contact={`Delivery ${o.delivery_method}`}><div className='card-actions'><button className='btn btn-dark' type='button' onClick={async () => { await api.updateOrderStatus(o.id, { fulfillment_status: 'SELLER_ACCEPTED', seller_note: 'Seller accepted order' }); await load() }}>Accept</button><button className='btn' type='button' onClick={async () => { await api.updateOrderStatus(o.id, { fulfillment_status: 'IN_FULFILLMENT', escrow_status: 'IN_FULFILLMENT', seller_note: 'Seller is preparing order' }); await load() }}>Preparing</button><button className='btn' type='button' onClick={async () => { await api.updateOrderStatus(o.id, { fulfillment_status: 'SHIPPED', escrow_status: 'IN_FULFILLMENT', seller_note: 'Seller marked as shipped' }); await load() }}>Mark Shipped</button><button className='btn' type='button' onClick={async () => { await api.updateOrderStatus(o.id, { fulfillment_status: 'DELIVERED', seller_note: 'Seller marked as delivered' }); await load() }}>Mark Delivered</button><button className='btn' type='button' onClick={async () => { const order = await api.fetchOrder(o.id); setSelectedOrder(order) }}>View Order</button><button className='btn' type='button' onClick={async () => { const receipt = await api.fetchOrderReceipt(o.id); setSelectedReceipt(receipt) }}>Receipt</button></div></ListingDetailCard>)}
 {!state.orders.filter(o => String(o.seller_id) === String(sellerOrderUserId)).length && <EmptyListingsState title='No seller orders yet' body='Seller orders will appear here with fulfillment and payout tracking.' />}
 </div>
 </article>

 <article className='panel'><h4>Admin Dispute & Release Console</h4>
 <div className='list'>
 {state.orders.map((o) => <ListingDetailCard key={`admin-${o.id}`} title={`${o.listing_title} • Order ${o.id}`} subtitle={`Escrow ${o.escrow_status} • Fulfillment ${o.fulfillment_status} • Payout ${o.payout_status}`} stats={[`${o.listing_type}`, `${o.gross_amount} ${o.currency}`, `${o.payment_status}`]} contact={`Platform fee ${o.platform_fee} • processing ${o.processing_fee}`}><div className='card-actions'><button className='btn btn-dark' type='button' onClick={async () => { try { await api.releaseOrder(o.id); await load() } catch (err) { alert(err?.response?.data?.detail || 'Could not release funds') } }}>Release Funds</button><button className='btn' type='button' onClick={async () => { await api.disputeOrder(o.id, { buyer_note: 'Admin escalated dispute for review' }); await load() }}>Flag Dispute</button><button className='btn' type='button' onClick={async () => { await api.updateOrderStatus(o.id, { escrow_status: 'REFUND_REVIEW', payout_status: 'ON_HOLD' }); await load() }}>Hold / Review</button><button className='btn' type='button' onClick={async () => { const order = await api.fetchOrder(o.id); setSelectedOrder(order) }}>View Order</button><button className='btn' type='button' onClick={async () => { const receipt = await api.fetchOrderReceipt(o.id); setSelectedReceipt(receipt) }}>Receipt</button></div></ListingDetailCard>)}
 {!state.orders.length && <EmptyListingsState title='No orders yet' body='Create an escrow order to start the marketplace order flow.' />}
 </div>
 </article>
 </div>

 <article className='panel' style={{marginTop:12}}><div className='panelHeadActions'><h4 style={{margin:0}}>Payment Records</h4><button className='btn btn-dark' type='button' onClick={async () => { await api.autoReleaseOrders({ force: false }); await load() }}>Run Auto Release</button><span className='helper-text'>Provider integration prep: receipts, payout history, and payment refs are now exposed.</span></div><DataTable columns={['id', 'payer_id', 'payee_id', 'amount', 'currency', 'status', 'reference']} rows={state.payments} filterKey='reference' /></article><article className='panel' style={{marginTop:12}}><h4>Payout History & Receipts</h4><DataTable columns={['id', 'order_id', 'amount', 'currency', 'status', 'reference', 'transfer_code', 'receipt_note']} rows={state.payoutHistory} filterKey='reference' /></article>
 </section>}

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
 <p style={{fontSize:'.85rem', color:'#64748b', marginTop:8}}>Tap map to add many boundary points, or paste multiple points below (one per line: lat,lng). When done, click “Close Area & Use”.</p>
 <textarea
 className='input'
 rows={4}
 placeholder={'Bulk points (one per line)\n5.6037,-0.1870\n5.6045,-0.1884\n5.6028,-0.1892'}
 value={mapBulkPointsInput}
 onChange={(e)=>setMapBulkPointsInput(e.target.value)}
 />
 <div className='inlineForm'>
 <button type='button' className='btn' onClick={addBulkPoints}>Add Bulk Points</button>
 <button type='button' className='btn' onClick={()=>setMapPolygonPoints([])}>Clear Points</button>
 <button type='button' className='btn' onClick={()=>setMapPolygonPoints(prev => prev.slice(0, -1))}>Undo Last</button>
 <button type='button' className='btn btn-dark' disabled={mapPolygonPoints.length < 3} onClick={applyPolygonToFarmForm}>Close Area & Use</button>
 </div>
 <div style={{fontSize:'.82rem', color:'#475569'}}>Points: {mapPolygonPoints.length} {mapPolygonPoints.length > 0 ? `• Est. Area: ${polygonAreaHectares(mapPolygonPoints).toFixed(2)} ha` : ''}</div>
 {mapPolygonPoints.length > 0 && <div style={{fontSize:'.78rem', color:'#64748b', maxHeight:80, overflow:'auto', marginTop:4}}>{mapPolygonPoints.map((p, i)=>`#${i+1} (${p.lat}, ${p.lng})`).join(' | ')}</div>}
 </div>

 <form className='inlineForm' onSubmit={async (e) => {
 e.preventDefault();
 await api.createPassport({
 ...farmMapForm,
 user_id: Number(farmMapForm.user_id),
 gps_lat: Number(farmMapForm.gps_lat),
 gps_lng: Number(farmMapForm.gps_lng),
 farm_size_hectares: Number(farmMapForm.farm_size_hectares),
 boundary_points: mapPolygonPoints,
 boundary_point_count: mapPolygonPoints.length
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
 {communityProfileView.open ? <article id='community-public-profile-view' className='panel' style={{border:'1px solid #cbd5e1', boxShadow:'0 12px 30px rgba(15,23,42,.08)', overflow:'hidden'}}>
 <div style={{padding:'16px 16px 10px 16px', borderBottom:'1px solid #e2e8f0', background:'linear-gradient(120deg,#ecfeff,#f8fafc)'}}>
 <div className='list-row' style={{alignItems:'flex-start', gap:12, flexWrap:'wrap'}}>
 <div>
 <div style={{fontSize:'.75rem', fontWeight:700, letterSpacing:'.08em', color:'#0284c7', textTransform:'uppercase'}}>Community profile</div>
 <h4 style={{margin:'4px 0 0 0'}}>{viewedCommunityViewer?.is_me ? 'How others see your community profile' : 'Public grower profile'}</h4>
 <div className='helper-text' style={{marginTop:4}}>Read-only full-page profile with no setup or edit controls.</div>
 </div>
 <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
 <button type='button' className='btn' onClick={()=>closeCommunityProfileView()}>← Back to Community</button>
 <button type='button' className='btn' onClick={()=>closeCommunityProfileView()}>Close</button>
 </div>
 </div>
 </div>
 {communityProfileView.loading && <div className='panel' style={{margin:16, background:'#f8fafc'}}>Loading profile…</div>}
 {!communityProfileView.loading && communityProfileView.error && <div className='panel' style={{margin:16, background:'#fff7ed', color:'#9a3412'}}>{communityProfileView.error}</div>}
 {!communityProfileView.loading && !communityProfileView.error && viewedCommunityProfile && <>
 <div style={{position:'relative'}}>
 {isUserImage(viewedCommunityProfile.cover_image_url)
 ? <img src={viewedCommunityProfile.cover_image_url} alt='Public cover' style={{width:'100%',height:260,objectFit:'cover',borderBottom:'1px solid #e2e8f0'}} />
 : <div style={{width:'100%',height:260,borderBottom:'1px solid #e2e8f0',background:'linear-gradient(135deg,#e0f2fe,#dcfce7)',display:'grid',placeItems:'center',color:'#0f172a',fontWeight:700}}>FarmSavior Community</div>}
 <div style={{position:'absolute',inset:0,background:'linear-gradient(180deg,rgba(15,23,42,0) 28%, rgba(15,23,42,.55) 100%)'}} />
 {isUserImage(viewedCommunityProfile.avatar_url)
 ? <img src={viewedCommunityProfile.avatar_url} alt='Public avatar' style={{position:'absolute',left:18,bottom:-50,width:124,height:124,objectFit:'cover',borderRadius:'50%',border:'5px solid #fff',boxShadow:'0 10px 24px rgba(15,23,42,.18)'}} />
 : <div style={{position:'absolute',left:18,bottom:-50,width:124,height:124,borderRadius:'50%',border:'5px solid #fff',background:'#e2e8f0',display:'grid',placeItems:'center',color:'#64748b',fontWeight:700}}>No DP</div>}
 </div>
 <div style={{padding:'64px 16px 18px 16px'}}>
 <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',alignItems:'flex-start'}}>
 <div>
 <div style={{fontSize:'1.45rem',fontWeight:800,color:'#0f172a'}}>{viewedCommunityProfile.full_name || `User ${viewedCommunityProfile.user_id}`}{viewedCommunityViewer?.is_me ? verificationBadge(me) : ''}</div>
 <div style={{fontSize:'.92rem',color:'#0284c7',fontWeight:700}}>{viewedCommunityProfile.username ? `@${viewedCommunityProfile.username}` : 'No username yet'}{viewedCommunityProfile.region ? ` • ${viewedCommunityProfile.region}` : ''}</div>
 <div style={{fontSize:'.95rem',color:'#475569',marginTop:8,maxWidth:780,whiteSpace:'pre-wrap'}}>{communityProfileHeadline(viewedCommunityProfile)}</div>
 </div>
 <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
 {!viewedCommunityViewer?.is_me && viewedCommunityProfile?.user_id && <button type='button' className={`btn ${isFollowingUser(viewedCommunityProfile.user_id) ? 'btn-dark' : ''}`} disabled={communityFollowBusyUserId === viewedCommunityProfile.user_id} onClick={async()=>{ await toggleFollowUser(viewedCommunityProfile.user_id); await openCommunityProfileView(viewedCommunityProfile.user_id, { skipHistory: true }) }}>{communityFollowBusyUserId === viewedCommunityProfile.user_id ? (isFollowingUser(viewedCommunityProfile.user_id) ? 'Unfollowing…' : 'Following…') : (isFollowingUser(viewedCommunityProfile.user_id) ? 'Following' : 'Follow')}</button>}
 {!viewedCommunityViewer?.is_me && viewedCommunityProfile?.user_id && viewedCommunityProfile?.can_message && <button type='button' className='btn' disabled={communityMessageOpeningUserId === viewedCommunityProfile.user_id} onClick={()=>{ closeCommunityProfileView({ skipHistory: true }); openCommunityMessages(viewedCommunityProfile) }}>{communityMessageOpeningUserId === viewedCommunityProfile.user_id ? 'Opening messages…' : 'Message'}</button>}
 {!viewedCommunityViewer?.is_me && viewedCommunityProfile?.user_id && !viewedCommunityProfile?.can_message && <button type='button' className='btn' disabled title={viewedCommunityProfile?.message_privacy === 'NOBODY' ? 'This user is not accepting direct messages.' : 'Follow this user first to message them.'}>{viewedCommunityProfile?.message_privacy === 'NOBODY' ? 'Messages Off' : 'Follow to Message'}</button>}
 {!viewedCommunityViewer?.is_me && viewedCommunityProfile?.user_id && <button type='button' className={`btn ${isMutedUser(viewedCommunityProfile.user_id) ? 'btn-dark' : ''}`} onClick={async()=>{ const wasMuted = isMutedUser(viewedCommunityProfile.user_id); await toggleMuteUser(viewedCommunityProfile.user_id); if (wasMuted) { await openCommunityProfileView(viewedCommunityProfile.user_id, { skipHistory: true }) } else { closeCommunityProfileView() } }}>{isMutedUser(viewedCommunityProfile.user_id) ? 'Unmute' : 'Mute / Hide'}</button>}
 </div>
 </div>
 <div style={{display:'flex',gap:12,flexWrap:'wrap',marginTop:12,fontSize:'.84rem',color:'#475569'}}>
 <span><strong>{viewedCommunityProfile.followers_count || 0}</strong> followers</span>
 <span><strong>{viewedCommunityProfile.following_count || 0}</strong> following</span>
 <span><strong>{viewedCommunityProfile.posts_count || viewedCommunityPosts.length || 0}</strong> posts</span>
 <span>{viewedCommunityProfile.role || 'Grower'}{viewedCommunityProfile.country ? ` • ${viewedCommunityProfile.country}` : ''}</span>
 </div>
 {!viewedCommunityViewer?.can_view_full_profile && <div className='panel' style={{marginTop:12, background:'#fff7ed', color:'#9a3412'}}>This profile is set to followers only. Follow this grower to unlock their full profile and posts.</div>}
 {(viewedCommunityProfile.farm_life || viewedCommunityProfile.interests) && viewedCommunityViewer?.can_view_full_profile && <div className='two-col' style={{marginTop:12}}>
 <div className='panel' style={{background:'#f8fafc'}}>
 <strong>Farm life</strong>
 <div style={{marginTop:6, color:'#475569', whiteSpace:'pre-wrap'}}>{viewedCommunityProfile.farm_life || 'No farm-life details shared yet.'}</div>
 </div>
 <div className='panel' style={{background:'#f8fafc'}}>
 <strong>Interests</strong>
 <div style={{marginTop:6, color:'#475569'}}>{viewedCommunityProfile.interests || 'No interests shared yet.'}</div>
 </div>
 </div>}
 <div style={{marginTop:14}}>
 <h5 style={{margin:'0 0 8px 0'}}>Recent community posts</h5>
 <div className='list'>
 {viewedCommunityPosts.map(post => <div key={`view-profile-post-${post.id}`} className='panel' style={{padding:10,border:'1px solid #dbe6df'}}>
 <div style={{fontSize:'.78rem', color:'#64748b'}}>{String(post.created_at || '').replace('T',' ').slice(0,16)}</div>
 {!!post.text && <div style={{marginTop:6, whiteSpace:'pre-wrap'}}>{post.text}</div>}
 {!!post.media_url && (String(post.media_type || '').toUpperCase() === 'VIDEO'
 ? <video src={post.media_url} controls style={{width:'100%', maxHeight:320, borderRadius:12, marginTop:8, background:'#000'}} />
 : <img src={post.media_url} alt='Profile post' style={{width:'100%', maxHeight:320, objectFit:'cover', borderRadius:12, marginTop:8}} />)}
 {!!post.tags && <div style={{fontSize:'.82rem', color:'#0284c7', marginTop:8}}>#{String(post.tags).split(',').map(s=>s.trim()).filter(Boolean).join(' #')}</div>}
 <div style={{display:'flex',gap:12,flexWrap:'wrap',marginTop:8,fontSize:'.78rem',color:'#64748b'}}>
 <span>{post.likes_count || 0} likes</span>
 <span>{post.comments_count || 0} comments</span>
 </div>
 </div>)}
 {!viewedCommunityPosts.length && viewedCommunityViewer?.can_view_full_profile && <div className='panel' style={{background:'#f8fafc'}}>No public posts yet.</div>}
 </div>
 </div>
 </div>
 </>}
 </article> : <>
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


 {(typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'granted') && <article className='panel' style={{marginBottom:10, border:'1px solid #fde68a', background:'#fffbeb'}}>
 <div className='list-row' style={{alignItems:'flex-start', gap:10, flexWrap:'wrap'}}>
 <div>
 <h4 style={{margin:'0 0 4px 0'}}>Enable call permissions</h4>
 <div className='helper-text'>To receive rings and answer calls smoothly, enable notifications + mic/camera permissions.</div>
 </div>
 <button type='button' className='btn btn-dark' disabled={communityCallPermissionBusy} onClick={()=>enableCommunityCallPermissions()}>Enable now</button>
 </div>
 </article>}


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
 <div className='list-row' style={{alignItems:'flex-start', gap:10}}>
 <div>
 <h4 style={{margin:'0 0 4px 0'}}>Seller payout settings</h4>
 <p className='helper-text' style={{margin:0}}>This is where a seller tells FarmSavior how to receive released escrow payouts.</p>
 </div>
 <button type='button' className='btn' onClick={() => setPayoutSettingsOpen(v => !v)}>{payoutSettingsOpen ? 'Hide' : 'Edit payout settings'}</button>
 </div>
 <div className='panel' style={{marginTop:10, background:'#f8fafc'}}>
 <strong>Payout status</strong>
 <div className='helper-text' style={{marginTop:6}}>{(state.payoutProfiles.find(x => String(x.user_id) === String(payoutForm.user_id))?.verification_status) || 'PENDING'} — funds release only after verification.</div>
 </div>
 {payoutSettingsOpen && <form className='list' style={{marginTop:10}} onSubmit={async e => {
 e.preventDefault()
 try {
 const payload = {
 ...payoutForm,
 user_id: Number(payoutForm.user_id),
 country: String(payoutForm.country || 'GH').trim().toUpperCase(),
 payout_method: String(payoutForm.payout_method || 'MOBILE_MONEY').trim().toUpperCase(),
 account_name: String(payoutForm.account_name || '').trim(),
 bank_name: String(payoutForm.bank_name || '').trim(),
 account_number: String(payoutForm.account_number || '').trim(),
 mobile_money_provider: String(payoutForm.mobile_money_provider || '').trim(),
 mobile_money_number: String(payoutForm.mobile_money_number || '').trim(),
 currency: String(payoutForm.currency || 'GHS').trim().toUpperCase()
 }
 if (!payload.user_id) throw new Error('Missing user ID')
 if (!payload.account_name) throw new Error('Account name is required')
 if (payload.payout_method === 'BANK_TRANSFER') {
 if (!payload.bank_name || !payload.account_number) throw new Error('Bank name and account number are required')
 payload.mobile_money_provider = ''
 payload.mobile_money_number = ''
 } else {
 if (!payload.mobile_money_provider || !payload.mobile_money_number) throw new Error('MoMo provider and MoMo number are required')
 payload.bank_name = ''
 payload.account_number = ''
 }
 setPayoutSaving(true)
 await api.savePayoutProfile(payload)
 await load()
 setPayoutSettingsOpen(false)
 alert('Seller payout method saved.')
 } catch (err) {
 alert(errMsg(err))
 } finally {
 setPayoutSaving(false)
 }
 }}>
 <div className='row2' style={{gap:10}}>
 <input className='input' placeholder='Your user ID' value={payoutForm.user_id} readOnly />
 <select className='input' value={payoutForm.payout_method} onChange={e => setPayoutForm({ ...payoutForm, payout_method: e.target.value })}>
 <option value='MOBILE_MONEY'>Mobile Money</option>
 <option value='BANK_TRANSFER'>Bank Transfer</option>
 </select>
 </div>
 <div className='row2' style={{gap:10}}>
 <input className='input' placeholder='Account name' value={payoutForm.account_name} onChange={e => setPayoutForm({ ...payoutForm, account_name: e.target.value })} />
 <select className='input' value={payoutForm.country} onChange={e => setPayoutForm({ ...payoutForm, country: e.target.value, currency: e.target.value === 'NG' ? 'NGN' : e.target.value === 'BF' ? 'XOF' : 'GHS' })}>
 <option value='GH'>GH</option>
 <option value='NG'>NG</option>
 <option value='BF'>BF</option>
 </select>
 </div>
 {payoutForm.payout_method === 'BANK_TRANSFER' ? <div className='row2' style={{gap:10}}>
 <input className='input' placeholder='Bank name' value={payoutForm.bank_name} onChange={e => setPayoutForm({ ...payoutForm, bank_name: e.target.value })} />
 <input className='input' placeholder='Account number' value={payoutForm.account_number} onChange={e => setPayoutForm({ ...payoutForm, account_number: e.target.value })} />
 </div> : <div className='row2' style={{gap:10}}>
 <select className='input' value={payoutForm.mobile_money_provider} onChange={e => setPayoutForm({ ...payoutForm, mobile_money_provider: e.target.value })}>
 <option value='MTN'>MTN</option>
 <option value='Vodafone Cash'>Vodafone Cash</option>
 <option value='AirtelTigo Money'>AirtelTigo Money</option>
 <option value='Orange Money'>Orange Money</option>
 <option value='Moov Money'>Moov Money</option>
 <option value='OPay'>OPay</option>
 <option value='PalmPay'>PalmPay</option>
 <option value='Paga'>Paga</option>
 </select>
 <input className='input' placeholder='MoMo number' value={payoutForm.mobile_money_number} onChange={e => setPayoutForm({ ...payoutForm, mobile_money_number: e.target.value })} />
 </div>}
 <div className='helper-text'>Funds release only after verification. Saving this form should show a success popup.</div>
 <button className='btn btn-dark' disabled={payoutSaving}>{payoutSaving ? 'Saving payout settings…' : 'Save payout settings'}</button>
 </form>}
 </article>
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
 <div style={{fontSize:'1rem',fontWeight:700,color:'#0f172a'}}>{(communityProfile.full_name || me?.full_name || 'Your profile') + verificationBadge(me)}</div>
 <div style={{fontSize:'.82rem',color:'#0284c7',fontWeight:600}}>@{communityProfile.username || 'set_username'}</div>
 <div style={{fontSize:'.85rem',color:'#475569'}}>{communityProfile.bio || 'Add a short bio to attract followers.'}</div>
 <div style={{display:'flex',gap:12,flexWrap:'wrap',marginTop:6,fontSize:'.78rem',color:'#475569'}}>
 <span><strong>{communityProfile.followers_count || communityFollowState.followers_count || 0}</strong> followers</span>
 <span><strong>{communityProfile.following_count || communityFollowState.following_count || 0}</strong> following</span>
 <span><strong>{communityPosts.filter(p => String(p.user_id) === String(me?.id)).length}</strong> posts</span>
 </div>
 <div style={{marginTop:10, display:'flex', gap:8, flexWrap:'wrap'}}>
 <button type='button' className='btn' disabled={communityProfileOpeningUserId === me?.id} onClick={()=>openCommunityProfileView(me?.id)}>{communityProfileOpeningUserId === me?.id ? 'Opening…' : 'View Public Profile'}</button>
 </div>
 </div>
 <div style={{marginTop:14, border:'1px solid #dbe6df', borderRadius:16, overflow:'hidden', background:'#f8fafc'}}>
 <button
 type='button'
 onClick={()=>setCommunityProfileEditorOpen(open => !open)}
 style={{width:'100%', border:'none', background:'transparent', padding:'14px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, textAlign:'left', cursor:'pointer'}}
 >
 <div>
 <div style={{fontWeight:700, color:'#0f172a'}}>{communityProfileEditorOpen ? 'Editing your profile' : 'Edit Profile'}</div>
 <div style={{fontSize:'.82rem', color:'#64748b'}}>{communityProfileDirty ? 'You have unsaved changes.' : 'Clean up photos, identity, story, and privacy settings.'}</div>
 </div>
 <div style={{display:'flex', alignItems:'center', gap:8, flexShrink:0}}>
 {communityProfileDirty && <span style={{fontSize:'.72rem', fontWeight:700, color:'#166534', background:'#dcfce7', padding:'4px 8px', borderRadius:999}}>Unsaved</span>}
 <span style={{fontSize:'1rem', color:'#475569'}}>{communityProfileEditorOpen ? '▴' : '▾'}</span>
 </div>
 </button>
 {communityProfileEditorOpen && <form className='list' style={{padding:'0 12px 12px 12px', gap:10}} onSubmit={async(e)=>{
 e.preventDefault()
 try {
 setCommunityProfileSaving(true)
 const nextProfile = {
 full_name: String(communityProfile.full_name || '').trim(),
 username: String(communityProfile.username || '').trim().toLowerCase().replace(/\s+/g,''),
 avatar_url: communityProfile.avatar_url || '',
 cover_image_url: communityProfile.cover_image_url || '',
 bio: String(communityProfile.bio || '').trim(),
 farm_life: String(communityProfile.farm_life || '').trim(),
 interests: String(communityProfile.interests || '').trim(),
 visibility: communityProfile.visibility || 'PUBLIC'
 }
 if (!nextProfile.full_name && me?.full_name) nextProfile.full_name = String(me.full_name || '').trim()
 if (!nextProfile.username && communityProfileBaseline?.username) nextProfile.username = communityProfileBaseline.username
 const saved = await api.saveCommunityProfileMe(nextProfile)
 const mergedProfile = { ...nextProfile, ...(saved || {}) }
 setCommunityProfile(mergedProfile)
 setCommunityProfileBaseline(mergedProfile)
 setCommunityPosts(prev => (prev || []).map(post => String(post.user_id) === String(me?.id)
 ? { ...post, author_full_name: mergedProfile.full_name || post.author_full_name, author_username: mergedProfile.username || post.author_username, author_avatar_url: mergedProfile.avatar_url || post.author_avatar_url, author_cover_image_url: mergedProfile.cover_image_url || post.author_cover_image_url }
 : post
 ))
 setCommunityProfileDirty(false)
 setCommunityProfileEditorOpen(false)
 const meRes = await api.fetchMe().catch(()=>null)
 if (meRes) {
 setMe(meRes)
 setAccountForm({ full_name: meRes.full_name || '', region: meRes.region || '' })
 }
 await loadCommunity()
 alert('Profile updated and synced across your community profile.')
 } catch (err) {
 alert(errMsg(err))
 } finally {
 setCommunityProfileSaving(false)
 }
 }}>
 <div style={{fontSize:'.78rem', color:'#64748b', padding:'0 4px'}}>Make quick updates without losing the profile preview above.</div>

 <details open={communityProfileSectionsOpen.photos} onToggle={(e)=>setCommunityProfileSectionsOpen(prev => ({ ...prev, photos: e.currentTarget.open }))} style={{border:'1px solid #e2e8f0', borderRadius:14, background:'#fff'}}>
 <summary style={{cursor:'pointer', listStyle:'none', padding:'12px 14px', fontWeight:700, color:'#0f172a'}}>Photos</summary>
 <div className='list' style={{padding:'0 12px 12px 12px', gap:8}}>
 <label style={{fontSize:'.82rem',color:'#475569'}}>Display picture</label>
 <input className='input' type='file' accept='image/*' onChange={async (e)=>{
 const f = e.target.files?.[0]
 if (!f) return
 try {
 const data = await compressImageFileToDataUrl(f, { maxDim: 960, quality: 0.72, maxChars: 450000 })
 setCommunityProfileDirty(true)
 setCommunityProfile(prev => ({ ...prev, avatar_url: data }))
 } catch (err) {
 alert(`Could not prepare display picture: ${err?.message || err}`)
 }
 }} />
 <label style={{fontSize:'.82rem',color:'#475569'}}>Cover image</label>
 <input className='input' type='file' accept='image/*' onChange={async (e)=>{
 const f = e.target.files?.[0]
 if (!f) return
 try {
 const data = await compressImageFileToDataUrl(f, { maxDim: 1400, quality: 0.76, maxChars: 700000 })
 setCommunityProfileDirty(true)
 setCommunityProfile(prev => ({ ...prev, cover_image_url: data }))
 } catch (err) {
 alert(`Could not prepare cover image: ${err?.message || err}`)
 }
 }} />
 </div>
 </details>

 <details open={communityProfileSectionsOpen.identity} onToggle={(e)=>setCommunityProfileSectionsOpen(prev => ({ ...prev, identity: e.currentTarget.open }))} style={{border:'1px solid #e2e8f0', borderRadius:14, background:'#fff'}}>
 <summary style={{cursor:'pointer', listStyle:'none', padding:'12px 14px', fontWeight:700, color:'#0f172a'}}>Identity</summary>
 <div className='list' style={{padding:'0 12px 12px 12px', gap:8}}>
 <input className='input' placeholder='Main name / display name' value={communityProfile.full_name || ''} onChange={(e)=>{ setCommunityProfileDirty(true); setCommunityProfile({...communityProfile, full_name:e.target.value}) }} />
 <input className='input' placeholder='Username (e.g. akhen_farmer)' value={communityProfile.username || ''} onChange={(e)=>{ setCommunityProfileDirty(true); setCommunityProfile({...communityProfile, username:e.target.value.toLowerCase().replace(/\s+/g,'')}) }} />
 </div>
 </details>

 <details open={communityProfileSectionsOpen.story} onToggle={(e)=>setCommunityProfileSectionsOpen(prev => ({ ...prev, story: e.currentTarget.open }))} style={{border:'1px solid #e2e8f0', borderRadius:14, background:'#fff'}}>
 <summary style={{cursor:'pointer', listStyle:'none', padding:'12px 14px', fontWeight:700, color:'#0f172a'}}>Bio & farm details</summary>
 <div className='list' style={{padding:'0 12px 12px 12px', gap:8}}>
 <textarea className='input' rows={3} placeholder='Short bio' value={communityProfile.bio || ''} onChange={(e)=>{ setCommunityProfileDirty(true); setCommunityProfile({...communityProfile, bio:e.target.value}) }} />
 <textarea className='input' rows={3} placeholder='Farm life details' value={communityProfile.farm_life || ''} onChange={(e)=>{ setCommunityProfileDirty(true); setCommunityProfile({...communityProfile, farm_life:e.target.value}) }} />
 <input className='input' placeholder='Interests/tags (comma separated)' value={communityProfile.interests || ''} onChange={(e)=>{ setCommunityProfileDirty(true); setCommunityProfile({...communityProfile, interests:e.target.value}) }} />
 </div>
 </details>

 <details open={communityProfileSectionsOpen.privacy} onToggle={(e)=>setCommunityProfileSectionsOpen(prev => ({ ...prev, privacy: e.currentTarget.open }))} style={{border:'1px solid #e2e8f0', borderRadius:14, background:'#fff'}}>
 <summary style={{cursor:'pointer', listStyle:'none', padding:'12px 14px', fontWeight:700, color:'#0f172a'}}>Privacy</summary>
 <div className='list' style={{padding:'0 12px 12px 12px', gap:8}}>
 <select className='input' value={communityProfile.visibility || 'PUBLIC'} onChange={(e)=>{ setCommunityProfileDirty(true); setCommunityProfile({...communityProfile, visibility:e.target.value}) }}>
 <option value='PUBLIC'>Public</option>
 <option value='FOLLOWERS'>Followers only</option>
 </select>
 <div style={{fontSize:'.78rem', color:'#64748b'}}>Choose who can view your community profile details in the public profile screen.</div>
 <select className='input' value={communityProfile.message_privacy || 'FOLLOWING'} onChange={(e)=>{ setCommunityProfileDirty(true); setCommunityProfile({...communityProfile, message_privacy:e.target.value}) }}>
 <option value='EVERYONE'>Everyone can message me</option>
 <option value='FOLLOWING'>Only growers who follow me can message me</option>
 <option value='NOBODY'>Nobody can message me</option>
 </select>
 <div style={{fontSize:'.78rem', color:'#64748b'}}>Direct messages respect this setting immediately. Existing conversations stay visible, but new sends are blocked when someone no longer qualifies.</div>
 </div>
 </details>

 <div style={{display:'flex', flexDirection:'column', gap:8, padding:'8px 4px 0 4px'}}>
 <button className='btn btn-dark' disabled={communityProfileSaving}>{communityProfileSaving ? 'Saving Profile…' : 'Save Profile'}</button>
 <div style={{fontSize:'.78rem', color:'#64748b', textAlign:'center'}}>{communityProfileDirty ? 'Save to publish your latest profile edits everywhere in Community.' : 'No unsaved changes right now.'}</div>
 </div>
 </form>}
 </div>
 </article>

 <article className='panel' style={{border:'1px solid #dbeafe', background:'linear-gradient(180deg,#eff6ff 0%,#f8fafc 100%)'}}>
 <h4 style={{marginTop:0}}>Messages & Calls</h4>
 <div className='helper-text' style={{marginBottom:8}}>Quick access to your inbox, calls, and active conversations.</div>
 <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
 <button type='button' className='btn btn-dark' onClick={()=>openCommunityInbox()}>{communityMessageThreads.length ? `Open Inbox (${communityMessageThreads.length})` : 'Open Inbox'}</button>
 {communityMessageView?.user?.user_id && <button type='button' className='btn' onClick={()=>openCommunityMessages(communityMessageView.user)}>Resume last chat</button>}
 </div>
 </article>

 <article className='panel'>
 <h4>{t('Create Post','Créer une publication','创建帖子')}</h4>
 <form className='list' onSubmit={async(e)=>{e.preventDefault(); try { setCommunitySubmitting(true); if (editingCommunityPostId) { await api.updateCommunityPost(editingCommunityPostId, communityPostForm) } else { await api.createCommunityPost(communityPostForm) } setCommunityPostForm({ text:'', media_url:'', media_type:'TEXT', tags:'' }); setEditingCommunityPostId(null); await loadCommunity(); } finally { setCommunitySubmitting(false) } }}>
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
 <div className='inlineForm'>
 <button className='btn btn-dark' disabled={communitySubmitting}>{communitySubmitting ? (editingCommunityPostId ? 'FarmSavior is saving your post…' : 'FarmSavior is uploading your post…') : (editingCommunityPostId ? 'Save Post Changes' : 'Post to Community')}</button>
 {editingCommunityPostId && <button type='button' className='btn' onClick={()=>{ setEditingCommunityPostId(null); setCommunityPostForm({ text:'', media_url:'', media_type:'TEXT', tags:'' }) }} disabled={communitySubmitting}>Cancel Edit</button>}
 </div>
 {communitySubmitting && <div className='panel' style={{padding:10, display:'flex', alignItems:'center', gap:10}}><div style={{fontSize:'1.2rem'}}>🌿</div><div><strong>FarmSavior Community</strong><div style={{fontSize:'.85rem', color:'#64748b'}}>{communityPostForm.media_url ? 'Uploading your image/video and publishing your post…' : 'Publishing your post…'}</div></div></div>}
 </form>
 </article>
 </div>

 <article className='panel' style={{marginTop:10}}>
 <div className='list-row' style={{alignItems:'flex-start', gap:10, flexWrap:'wrap'}}>
 <div>
 <h4 style={{margin:'0 0 4px 0'}}>Find growers to follow</h4>
 <div className='helper-text'>Search by name, username, region, bio, or interests. Following shapes your home feed with posts, profile updates, and fresh listings.</div>
 </div>
 <div style={{display:'flex',gap:8,flexWrap:'wrap',fontSize:'.82rem',color:'#475569'}}>
 <span><strong>{communityFollowState.following_count || 0}</strong> following</span>
 <span><strong>{communityFollowState.followers_count || communityProfile.followers_count || 0}</strong> followers</span>
 <span><strong>{communityFollowState.muted_count || 0}</strong> muted</span>
 </div>
 </div>
 <div className='inlineForm' style={{marginTop:10}}>
 <input className='input' placeholder='Search farmers, buyers, usernames, interests…' value={communityUserSearch} onChange={(e)=>setCommunityUserSearch(e.target.value)} />
 <button type='button' className='btn' onClick={()=>setCommunityUserSearch('')}>Clear</button>
 </div>
 <div className='list' style={{marginTop:10}}>
 {(communityUserResults || []).slice(0, 8).map((user)=><div key={`community-user-${user.user_id}`} className='panel' style={{padding:10,border:'1px solid #dbe6df',boxShadow:'0 1px 6px rgba(0,0,0,.04)'}}>
 <div className='list-row' style={{alignItems:'center', gap:10, flexWrap:'wrap'}}>
 <div style={{display:'flex',alignItems:'center',gap:10}}>
 {isUserImage(user.avatar_url)
 ? <img src={user.avatar_url} alt='avatar' style={{width:44,height:44,objectFit:'cover',borderRadius:'50%',border:'1px solid #e2e8f0'}} />
 : <div style={{width:44,height:44,borderRadius:'50%',background:'#e2e8f0',display:'grid',placeItems:'center',color:'#64748b',fontSize:'.75rem'}}>No DP</div>}
 <div>
 <div style={{fontWeight:700}}>{user.full_name}{user.country ? ` (${user.country})` : ''}</div>
 <div style={{fontSize:'.8rem', color:'#0284c7'}}>{user.username ? `@${user.username}` : 'No username yet'}{user.region ? ` • ${user.region}` : ''}</div>
 </div>
 </div>
 {!user.is_me && <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
 <button className={`btn ${isFollowingUser(user.user_id) ? 'btn-dark' : ''}`} disabled={communityFollowBusyUserId === user.user_id} onClick={()=>toggleFollowUser(user.user_id)}>{communityFollowBusyUserId === user.user_id ? (isFollowingUser(user.user_id) ? 'Unfollowing…' : 'Following…') : (isFollowingUser(user.user_id) ? 'Following' : 'Follow')}</button>
 {user?.can_message && <button className='btn' disabled={communityMessageOpeningUserId === user.user_id} onClick={()=>openCommunityMessages(user)}>{communityMessageOpeningUserId === user.user_id ? 'Opening messages…' : 'Message'}</button>}
 <button className={`btn ${isMutedUser(user.user_id) ? 'btn-dark' : ''}`} onClick={()=>toggleMuteUser(user.user_id)}>{isMutedUser(user.user_id) ? 'Unmute' : 'Mute / Hide'}</button>
 </div>}
 </div>
 <div style={{fontSize:'.86rem',color:'#475569',marginTop:6}}>{user.bio || user.farm_life || `Interested in ${user.interests || 'farming'}.`}</div>
 <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:8}}><button type='button' className='btn' disabled={communityProfileOpeningUserId === user.user_id} onClick={()=>openCommunityProfileView(user.user_id)}>{communityProfileOpeningUserId === user.user_id ? 'Opening…' : 'View Profile'}</button></div>
 <div style={{display:'flex',gap:12,flexWrap:'wrap',marginTop:8,fontSize:'.78rem',color:'#64748b'}}>
 <span><strong>{user.followers_count || 0}</strong> followers</span>
 <span><strong>{user.following_count || 0}</strong> following</span>
 <span><strong>{user.posts_count || 0}</strong> posts</span>
 <span>{isMutedUser(user.user_id) ? 'Muted' : 'Visible'}</span>
 </div>
 </div>)}
 {!(communityUserResults || []).length && <div className='list-row'><span>{communityUserSearch ? 'No matching community users yet.' : 'Start typing to find growers and agri-builders to follow.'}</span></div>}
 </div>
 </article>

 <article className='panel community-inbox-card' style={{marginTop:10}}>
 <div className='community-inbox-hero'>
 <div>
 <div className='community-inbox-kicker'>Direct messages</div>
 <h4 style={{margin:'4px 0 6px 0'}}>Open a real inbox, not a hidden thread.</h4>
 <div className='helper-text'>Tap Message from any profile, search result, or post to jump straight into a focused conversation view with loading, send, and close states.</div>
 </div>
 <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
 <button type='button' className='btn btn-dark' onClick={()=>openCommunityInbox()}>{communityMessageThreads.length ? `Open Inbox (${communityMessageThreads.length})` : 'Open Inbox'}</button>
 {communityMessageView?.user?.user_id && <button type='button' className='btn' onClick={()=>openCommunityMessages(communityMessageView.user)}>Resume chat</button>}
 </div>
 </div>
 <div className='community-thread-preview-list'>
 {(communityMessageThreads || []).slice(0, 3).map((thread)=><button key={`community-thread-preview-${thread?.user?.user_id}`} type='button' className='community-thread-preview' onClick={()=>openCommunityMessages(thread.user)}>
 <div>
 <strong>{thread?.user?.full_name || `User ${thread?.user?.user_id || ''}`}</strong>
 <div style={{fontSize:'.8rem', color:'#0284c7'}}>{thread?.user?.username ? `@${thread.user.username}` : 'No username yet'}</div>
 </div>
 <div style={{fontSize:'.84rem', color:'#475569', textAlign:'left'}}>{(()=>{ const tx = String(thread?.last_message?.text || 'No messages yet'); const lx = tx.toLowerCase(); if (lx.includes('join my audio call:') || lx.includes('join my video call:') || lx.includes('meet.jit.si/')) return `📞 ${thread?.last_message?.is_mine ? 'Outgoing' : 'Missed'} call`; return `${thread?.last_message?.is_mine ? 'You: ' : ''}${tx.slice(0, 88)}` })()}</div>
 </button>)}
 {!communityMessageThreads.length && <div className='community-thread-preview community-thread-preview-empty'>Your inbox will appear here after you send or receive your first direct message.</div>}
 </div>
 </article>

 {communityInboxOpen && <div className='community-messenger-overlay' onClick={(e)=>{ if (e.target === e.currentTarget) closeCommunityMessages() }}>
 <div className={`community-messenger-shell ${communityMessageView.open ? 'conversation-open' : ''}`}>
 <div className='community-messenger-sidebar'>
 <div className='community-messenger-sidebar-head'>
 <div>
 <div className='community-inbox-kicker'>Inbox</div>
 <h4 style={{margin:'4px 0 0 0'}}>Community messages</h4>
 </div>
 <button type='button' className='btn' onClick={closeCommunityMessages}>Close</button>
 </div>
 <div className='helper-text' style={{marginBottom:10}}>{communityMessageThreads.length ? `${communityMessageThreads.length} conversation${communityMessageThreads.length === 1 ? '' : 's'} ready` : 'No conversations yet — tap Message on a profile, search result, or post to start one.'}</div>
 {((communityMessageThreads || []).filter(t=>{ const tx = String(t?.last_message?.text || '').toLowerCase(); return tx.includes('join my audio call:') || tx.includes('join my video call:') || tx.includes('meet.jit.si/') }).slice(0,5).length > 0) && <div className='panel' style={{marginBottom:10, background:'#f8fafc', border:'1px solid #dbe6df'}}>
 <div style={{fontWeight:700, marginBottom:6}}>Recent Calls</div>
 <div className='list'>
 {(communityMessageThreads || []).filter(t=>{ const tx = String(t?.last_message?.text || '').toLowerCase(); return tx.includes('join my audio call:') || tx.includes('join my video call:') || tx.includes('meet.jit.si/') }).slice(0,5).map((thread)=>{ const tx = String(thread?.last_message?.text || '').toLowerCase(); const mode = tx.includes('video') ? 'Video' : 'Audio'; const status = thread?.last_message?.is_mine ? 'Outgoing' : 'Missed'; return <button key={`recent-call-${thread?.user?.user_id}`} type='button' className='list-row' style={{justifyContent:'space-between', width:'100%', textAlign:'left', background:'#fff', border:'1px solid #e2e8f0', borderRadius:10}} onClick={()=>openCommunityMessages(thread.user)}><span>{mode} • {status} • {thread?.user?.full_name || `User ${thread?.user?.user_id || ''}`}</span><span style={{fontSize:'.75rem', color:'#64748b'}}>{String(thread?.last_message?.created_at || '').replace('T',' ').slice(0,16)}</span></button> })}
 </div>
 </div>}
 <div className='community-thread-list'>
 {(communityMessageThreads || []).map((thread)=><button key={`community-thread-${thread?.user?.user_id}`} type='button' className={`community-thread-row ${String(communityMessageView?.user?.user_id || '') === String(thread?.user?.user_id || '') ? 'active' : ''}`} onClick={()=>openCommunityMessages(thread.user)}>
 <div className='community-thread-row-top'>
 <strong>{thread?.user?.full_name || `User ${thread?.user?.user_id || ''}`}</strong>
 <span>{String(thread?.last_message?.created_at || '').replace('T',' ').slice(0,16)}</span>
 </div>
 <div style={{fontSize:'.8rem', color:'#0284c7'}}>{thread?.user?.username ? `@${thread.user.username}` : 'No username yet'}</div>
 <div className='community-thread-snippet'>{(()=>{ const tx = String(thread?.last_message?.text || ''); const lx = tx.toLowerCase(); if (lx.includes('join my audio call:') || lx.includes('join my video call:') || lx.includes('meet.jit.si/')) return `📞 ${thread?.last_message?.is_mine ? 'Outgoing' : 'Missed'} call activity (see Recent Calls)`; return `${thread?.last_message?.is_mine ? 'You: ' : ''}${tx.slice(0, 120)}` })()}</div>
 </button>)}
 {!communityMessageThreads.length && <div className='community-thread-preview community-thread-preview-empty'>No active conversations yet.</div>}
 </div>
 </div>
 <div className='community-messenger-main'>
 <div className='community-messenger-main-head'>
 <div>
 <div className='community-inbox-kicker'>Conversation</div>
 <h4 style={{margin:'4px 0 0 0'}}>{communityMessageView?.user?.full_name || 'Select a conversation'}</h4>
 <div className='helper-text'>{communityMessageView?.user?.username ? `@${communityMessageView.user.username}` : (communityMessageView.loading ? 'Opening chat…' : 'Choose someone to start messaging.')}</div>
 </div>
 <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
 {communityMessageView.open && <button type='button' className='btn community-mobile-back-btn' onClick={()=>setCommunityMessageView({ open: false, loading: false, error: '', user: null, messages: [] })}>Back to inbox</button>}
 {communityMessageView.open && <button type='button' className='btn' disabled={communityMessageSending} onClick={()=>sendCommunityCallInvite('audio')}>{communityMessageSending ? 'Starting…' : 'Audio'}</button>}
 {communityMessageView.open && <button type='button' className='btn' disabled={communityMessageSending} onClick={()=>sendCommunityCallInvite('video')}>{communityMessageSending ? 'Starting…' : 'Video'}</button>}
 <button type='button' className='btn' onClick={closeCommunityMessages}>Close</button>
 </div>
 </div>
 {!communityMessageView.open && <div className='community-messenger-empty'>
 <div className='empty-emoji'>💬</div>
 <strong>Pick a conversation from the inbox</strong>
 <span>Start a new conversation from any profile, then use Audio or Video call instantly from the header.</span>
 <div style={{display:'flex', gap:8, flexWrap:'wrap', justifyContent:'center'}}>
 <button type='button' className='btn btn-dark' onClick={()=>{ closeCommunityMessages(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Start New Conversation</button>
 <button type='button' className='btn' disabled title='Select a conversation first'>Audio Call</button>
 <button type='button' className='btn' disabled title='Select a conversation first'>Video Call</button>
 </div>
 </div>}
 {communityMessageView.open && <>
 {communityMessageView.loading && <div className='community-messenger-empty'><div className='empty-emoji'>⏳</div><strong>Opening messages…</strong><span>Loading the latest conversation safely.</span></div>}
 {!!communityMessageView.error && <div className='panel' style={{marginTop:8, background:'#fff7ed', color:'#9a3412'}}>{communityMessageView.error}</div>}
 {!communityMessageView.loading && !communityMessageView.error && <>
 <div ref={communityMessageListRef} className='community-message-scroll'>
 {(communityMessageView.messages || [])
 .filter((msg)=>{
 const t = String(msg?.text || '').toLowerCase()
 return !(t.includes('join my audio call:') || t.includes('join my video call:') || t.includes('meet.jit.si/'))
 })
 .map((msg)=><div key={`community-dm-${msg.id}`} style={{display:'flex', justifyContent: msg.is_mine ? 'flex-end' : 'flex-start'}}>
 <div className={`community-message-bubble ${msg.is_mine ? 'mine' : ''}`}>
 <div style={{whiteSpace:'pre-wrap'}}>{msg.text}</div>
 <div className='community-message-meta'>{String(msg.created_at || '').replace('T',' ').slice(0,16)}</div>
 </div>
 </div>)}
 {!(communityMessageView.messages || []).length && <div className='community-messenger-empty compact'><strong>No messages yet.</strong><span>Send the first message to start the conversation.</span></div>}
 </div>
 <div className='community-message-composer'>
 <input className='input' placeholder='Write a direct message…' value={communityMessageDraft} onChange={(e)=>setCommunityMessageDraft(e.target.value)} disabled={communityMessageSending} onKeyDown={(e)=>{ if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendActiveCommunityMessage() } }} />
 <button type='button' className='btn btn-dark' disabled={communityMessageSending || !String(communityMessageDraft || '').trim()} onClick={sendActiveCommunityMessage}>{communityMessageSending ? 'Sending…' : 'Send'}</button>
 </div>
 <div style={{marginTop:6, fontSize:'.76rem', color:'#64748b'}}>If this grower changes inbox privacy, new sends can be blocked even if the thread still appears here.</div>
 <div style={{marginTop:4, fontSize:'.76rem', color:'#64748b'}}>Calls work best when microphone/camera permissions are allowed in browser settings.</div>
 </>}
 </>}
 </div>
 </div>
 </div>}

 {communityIncomingCall?.url && <div className='community-messenger-overlay' style={{zIndex: 220}}>
 <div className='panel' style={{maxWidth:420, width:'92vw', border:'2px solid #0ea5e9', boxShadow:'0 20px 40px rgba(15,23,42,.25)'}}>
 <div style={{fontSize:'.78rem', fontWeight:700, color:'#0284c7', letterSpacing:'.08em', textTransform:'uppercase'}}>Incoming call</div>
 <h4 style={{margin:'6px 0 4px 0'}}>{communityIncomingCall.from} is calling you</h4>
 <div className='helper-text' style={{marginBottom:10}}>{communityIncomingCall.mode === 'video' ? 'Video call' : 'Audio call'} — answer now?</div>
 <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
 <button type='button' className='btn btn-dark' onClick={()=>{ const url = communityIncomingCall.url; const mode = communityIncomingCall.mode; setCommunityIncomingCall(null); setCommunityActiveCall({ url, mode }) }}>Answer</button>
 <button type='button' className='btn' onClick={()=>setCommunityIncomingCall(null)}>Decline</button>
 </div>
 </div>
 </div>}

 {communityActiveCall?.url && <div className='community-messenger-overlay' style={{zIndex: 240, padding: 0}}>
 <div style={{width:'100vw', height:'100vh', background:'#000', display:'grid', gridTemplateRows:'auto 1fr'}}>
 <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', background:'rgba(2,6,23,.86)', color:'#fff'}}>
 <strong>{communityActiveCall?.mode === 'video' ? 'Video Call' : 'Audio Call'}</strong>
 <button type='button' className='btn' onClick={()=>setCommunityActiveCall(null)}>End Call</button>
 </div>
 <iframe title='FarmSavior Call' src={communityActiveCall.url} allow='camera; microphone; fullscreen; display-capture; autoplay' style={{width:'100%', height:'100%', border:'0'}} />
 </div>
 </div>}

 <article className='panel' style={{marginTop:10}}>
 <div className='tabs' style={{marginBottom:8, flexWrap:'wrap'}}>
 <button className={`tab ${communityFeedMode === 'for-you' ? 'active' : ''}`} onClick={()=>setCommunityFeedMode('for-you')}>For You</button>
 <button className={`tab ${communityFeedMode === 'following' ? 'active' : ''}`} onClick={()=>setCommunityFeedMode('following')}>Following</button>
 <button className={`tab ${communityFeedMode === 'reels' ? 'active' : ''}`} onClick={()=>setCommunityFeedMode('reels')}>FarmReels</button>
 </div>
 <div className='list'>
 {(communityFeedMode === 'reels'
 ? communityPosts.filter(x => String(x.media_type || '').toUpperCase() === 'VIDEO').map(post => ({ type: 'community_post', id: `post-${post.id}`, actor: { user_id: post.user_id, full_name: post.author_full_name, username: post.author_username, avatar_url: post.author_avatar_url, country: post.author_country, is_following: isFollowingUser(post.user_id) }, post, created_at: post.created_at, summary: 'Shared a reel' }))
 : communityFeedMode === 'following'
 ? communityFeedItems.filter(item => item?.type !== 'profile_update' || !item?.post)
 : communityFeedItems
 ).map((item)=>{
 const p = item?.post
 const actor = item?.actor || {}
 const canFollow = actor?.user_id && String(actor.user_id) !== String(me?.id)
 return <div key={`cp-${item.id}`} className='panel' style={{padding:10,border:'1px solid #dbe6df',boxShadow:'0 1px 6px rgba(0,0,0,.05)'}}>
 <div className='list-row' style={{alignItems:'center', gap:10, flexWrap:'wrap'}}>
 <div style={{display:'flex',alignItems:'center',gap:10}}>
 {isUserImage(actor.avatar_url || p?.author_avatar_url)
 ? <img src={actor.avatar_url || p?.author_avatar_url} alt='Author avatar' style={{width:42,height:42,objectFit:'cover',borderRadius:'50%',border:'1px solid #e2e8f0'}} />
 : <div style={{width:42,height:42,borderRadius:'50%',background:'#e2e8f0',display:'grid',placeItems:'center',color:'#64748b',fontSize:'.75rem'}}>No DP</div>}
 <div>
 <strong>{actor.full_name || p?.author_full_name || p?.author_name || `User ${actor.user_id || p?.user_id || ''}`} {(actor.country || p?.author_country) ? `(${actor.country || p?.author_country})` : ''}</strong>
 <div style={{fontSize:'.78rem', color:'#0284c7'}}>{actor.username || p?.author_username ? `@${actor.username || p?.author_username}` : ''}</div>
 </div>
 </div>
 <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
 {canFollow && communityFeedMode !== 'reels' && <button className={`btn ${isFollowingUser(actor.user_id) ? 'btn-dark' : ''}`} disabled={communityFollowBusyUserId === actor.user_id} onClick={()=>toggleFollowUser(actor.user_id)}>{communityFollowBusyUserId === actor.user_id ? (isFollowingUser(actor.user_id) ? 'Unfollowing…' : 'Following…') : (isFollowingUser(actor.user_id) ? 'Following' : 'Follow')}</button>}
 {actor?.can_message && <button type='button' className='btn' disabled={communityMessageOpeningUserId === actor.user_id} onClick={()=>openCommunityMessages(actor)}>{communityMessageOpeningUserId === actor.user_id ? 'Opening messages…' : 'Message'}</button>}
 {actor?.user_id && <button type='button' className='btn' disabled={communityProfileOpeningUserId === actor.user_id} onClick={()=>openCommunityProfileView(actor.user_id)}>{communityProfileOpeningUserId === actor.user_id ? 'Opening…' : 'View Profile'}</button>}
 <span style={{fontSize:'.78rem', color:'#64748b'}}>{String(item.created_at || '').replace('T',' ').slice(0,16)}</span>
 </div>
 </div>
 <div style={{fontSize:'.8rem', color:'#64748b', margin:'4px 0 8px'}}>{item.summary || 'Community activity'}</div>
 {item.type === 'profile_update' && <div style={{margin:'6px 0', whiteSpace:'pre-wrap'}}>{item?.profile_update?.bio || item?.profile_update?.farm_life || 'Updated profile images and farm bio.'}</div>}
 {item.type === 'crop_listing' || item.type === 'livestock_listing' ? <div style={{margin:'6px 0', whiteSpace:'pre-wrap'}}><strong>{item?.listing?.title}</strong> • {item?.listing?.quantity || 0} {item?.listing?.unit_label || ''}{item?.listing?.location ? ` • ${item.listing.location}` : ''}{item?.listing?.unit_price ? ` • ₵${item.listing.unit_price}` : ''}</div> : null}
 {p?.text && <div style={{margin:'6px 0', whiteSpace:'pre-wrap'}}>{p.text}</div>}
 {((p?.media_url) || item?.listing?.cover_image_url || item?.profile_update?.cover_image_url) && (
 (p?.media_type === 'VIDEO')
 ? <video src={p.media_url} controls style={{width:'100%', maxHeight:360, borderRadius:10, background:'#000'}} />
 : <img src={p?.media_url || item?.listing?.cover_image_url || item?.profile_update?.cover_image_url || item?.profile_update?.avatar_url} alt='community activity' style={{width:'100%', maxHeight:360, objectFit:'cover', borderRadius:10}} />
 )}
 {!!p?.tags && <div style={{fontSize:'.82rem', color:'#0284c7', marginTop:6}}>#{String(p.tags).split(',').map(s=>s.trim()).filter(Boolean).join(' #')}</div>}
 {!!p && <>
 <div className='list-row' style={{marginTop:8, flexWrap:'wrap', gap:8}}>
 <button className='btn' disabled={isCommunityLikeBusy(p.id)} onClick={async()=>{
 if (isCommunityLikeBusy(p.id)) return
 try {
 setCommunityLikeBusyPostIds(prev => ({ ...(prev || {}), [p.id]: true }))
 const result = await api.toggleCommunityPostLike(p.id)
 setCommunityPosts(prev => (prev || []).map(post => String(post.id) === String(p.id)
 ? { ...post, liked_by_me: !!result?.liked, likes_count: Number(result?.likes_count ?? post.likes_count ?? 0) }
 : post
 ))
 setCommunityFeedItems(prev => (prev || []).map(feedItem => String(feedItem?.post?.id) === String(p.id)
 ? { ...feedItem, post: { ...(feedItem.post || {}), liked_by_me: !!result?.liked, likes_count: Number(result?.likes_count ?? feedItem?.post?.likes_count ?? 0) } }
 : feedItem
 ))
 } catch (e) {
 alert(errMsg(e))
 } finally {
 setCommunityLikeBusyPostIds(prev => ({ ...(prev || {}), [p.id]: false }))
 }
 }}>👍 {isCommunityLikeBusy(p.id) ? (p.liked_by_me ? 'Removing like…' : 'Liking…') : (p.liked_by_me ? 'Unlike' : 'Like')} ({p.likes_count || 0})</button>
 <button className='btn' onClick={async()=>{ const rows=await api.fetchCommunityPostComments(p.id).catch(()=>[]); setCommunityComments(prev=>({...prev,[p.id]:rows||[]})) }}>💬 Comments ({p.comments_count || 0})</button>
 {me?.id === p.user_id && <button className='btn' onClick={()=>{ setEditingCommunityPostId(p.id); setCommunityPostForm({ text: p.text || '', media_url: p.media_url || '', media_type: p.media_type || 'TEXT', tags: p.tags || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>✏️ Edit</button>}
 {me?.id === p.user_id && <button className='btn' onClick={async()=>{ if (!confirm('Delete this post?')) return; await api.deleteCommunityPost(p.id); if (editingCommunityPostId === p.id) { setEditingCommunityPostId(null); setCommunityPostForm({ text:'', media_url:'', media_type:'TEXT', tags:'' }) } await loadCommunity(); }}>🗑️ Delete</button>}
 </div>
 <div className='inlineForm' style={{marginTop:6}}>
 <input className='input' placeholder='Write comment...' value={communityCommentText[p.id] || ''} onChange={(e)=>setCommunityCommentText(prev=>({...prev,[p.id]:e.target.value}))} />
 <button className='btn' onClick={async()=>{ const txt=(communityCommentText[p.id]||'').trim(); if(!txt) return; await api.addCommunityPostComment(p.id,{text:txt}); setCommunityCommentText(prev=>({...prev,[p.id]:''})); const rows=await api.fetchCommunityPostComments(p.id).catch(()=>[]); setCommunityComments(prev=>({...prev,[p.id]:rows||[]})); await loadCommunity(); }}>Send</button>
 </div>
 {(communityComments[p.id] || []).length > 0 && <div className='list' style={{marginTop:6}}>
 {(communityComments[p.id] || []).slice(-5).map((c)=><div className='list-row' key={`cc-${c.id}`}><span><strong>{c.author_name || `User ${c.user_id}`}:</strong> {c.text}</span></div>)}
 </div>}
 </>}
 </div>
 })}
 {!((communityFeedMode === 'reels'
 ? communityPosts.filter(x => String(x.media_type || '').toUpperCase() === 'VIDEO').length
 : communityFeedItems.length)) && (
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

 </>}
 </section>}

 {active === 'ai-disease' && <section className='disease-shell'>
 <div className='disease-hero'>
 <div>
 <div className='disease-eyebrow'>AI LIVESTOCK HEALTH</div>
 <h3>{t('AI Disease Analyzer','Analyseur IA des maladies','AI 病害分析')}</h3>
 <p>Upload a clear livestock photo, add symptoms if you have them, and get a structured first-pass assessment with prevention, treatment, and follow-up guidance.</p>
 </div>
 <div className='disease-hero-actions'>
 <button className='btn' type='button' onClick={() => { setDiseaseResult(null); setDiseaseImagePreview(''); setDiseaseImageFileName(''); setDiseaseForm(prev => ({ ...prev, target: '', image_url: '', context_note: '' })) }}>Start fresh</button>
 <button className='btn btn-dark' type='button' onClick={() => document.getElementById('disease-analyzer-form')?.scrollIntoView({ behavior:'smooth', block:'start' })}>New analysis</button>
 </div>
 </div>
 <div className='disease-overview-grid'>
 <div className='disease-stat-card disease-stat-card-primary'>
 <span>Animal scans</span>
 <strong>{state.diseaseScans.filter(r => !r.category || String(r.category).toLowerCase() === 'animal').length}</strong>
 <small>Total livestock disease analyses saved in admin history.</small>
 </div>
 <div className='disease-stat-card'>
 <span>Selected animal</span>
 <strong>{diseaseForm.target ? (animalOptions.find(x => x.value === diseaseForm.target)?.label || diseaseForm.target) : 'None'}</strong>
 <small>Choose the closest animal type before you submit a photo.</small>
 </div>
 <div className='disease-stat-card'>
 <span>Evidence strength</span>
 <strong>{diseaseResult?.analysis_signal || 'Pending'}</strong>
 <small>{diseaseResult?.insufficient_evidence ? 'Low evidence detected. Add clearer images or more context.' : 'Clear images improve confidence and treatment guidance.'}</small>
 </div>
 <div className='disease-stat-card'>
 <span>Latest confidence</span>
 <strong>{diseaseResult ? `${Math.round((diseaseResult.confidence || 0) * 100)}%` : '—'}</strong>
 <small>{diseaseResult?.diagnosis || 'Results will appear here after an analysis completes.'}</small>
 </div>
 </div>
 <div className='disease-main-grid'>
 <div className='disease-form-column'>
 <form id='disease-analyzer-form' className='panel disease-panel disease-form-panel' onSubmit={async e => {
 e.preventDefault();
 try {
 setDiseaseAnalyzing(true)
 if (!diseaseForm.target) { alert('Please select animal type first.'); return }
 if (!diseaseForm.image_url) { alert('Please upload an animal image from your device or camera.'); return }
 const r = await api.analyzeDisease({ user_id: Number(diseaseForm.user_id), category: 'animal', crop_type: diseaseForm.target, image_url: diseaseForm.image_url, context_note: diseaseForm.context_note });
 setDiseaseResult(r)
 api.fetchDiseaseScans().then(rows => setState(prev => ({ ...prev, diseaseScans: rows }))).catch(() => {})
 } catch (err) {
 alert(`Analyze failed: ${errMsg(err)}`)
 } finally {
 setDiseaseAnalyzing(false)
 }
 }}>
 <div className='disease-panel-head'>
 <div>
 <div className='disease-panel-title'>Submit a livestock case</div>
 <div className='helper-text'>Use bright, close-up photos and mention visible symptoms, duration, or recent feed and weather changes.</div>
 </div>
 <div className='disease-panel-pill'>Animal AI</div>
 </div>
 <div className='disease-form-grid'>
 <label className='disease-field'>
 <span>User ID</span>
 <input className='input' placeholder='User ID' value={diseaseForm.user_id} onChange={(e)=>setDiseaseForm({...diseaseForm,user_id:e.target.value,category:'animal'})} />
 </label>
 <label className='disease-field'>
 <span>Animal type</span>
 <select className='input' value={diseaseForm.target} onChange={(e)=>setDiseaseForm({...diseaseForm,category:'animal',target:e.target.value})} required>
 <option value=''>Select animal</option>
 {animalOptions.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
 </select>
 </label>
 <label className='disease-field disease-field-wide'>
 <span>Observed symptoms</span>
 <textarea className='input disease-textarea' placeholder='Describe animal symptoms (optional): e.g., coughing, discharge, lesions, diarrhea, fever...' value={diseaseForm.context_note || ''} onChange={(e)=>setDiseaseForm({...diseaseForm,context_note:e.target.value,category:'animal'})} rows={4} />
 </label>
 <label className='disease-field disease-field-wide'>
 <span>Upload photo</span>
 <input className='input' type='file' accept='image/*' onChange={async (e)=>{
 const f = e.target.files?.[0]
 if (!f) return
 setDiseaseImageFileName(f.name)
 try {
 const data = await compressImageFileToDataUrl(f, { maxDim: 960, quality: 0.7, maxChars: 450000 })
 setDiseaseImagePreview(data)
 const lightweightImageRef = `uploaded-image://${encodeURIComponent(f.name || 'animal-photo.jpg')}`
 setDiseaseForm(prev => ({ ...prev, category:'animal', image_url: lightweightImageRef }))
 } catch (err) {
 alert(`Could not prepare image: ${err?.message || err}`)
 }
 }} />
 </label>
 <div className='disease-upload-card disease-field-wide'>
 <div>
 <strong>{diseaseImageFileName || 'No photo uploaded yet'}</strong>
 <div className='helper-text'>{diseaseImageFileName ? 'Image prepared and ready for analysis.' : 'The preview appears here after you choose an image from your device or camera.'}</div>
 </div>
 {diseaseImagePreview ? <img src={diseaseImagePreview} alt='Disease scan preview' className='disease-preview-image' /> : <div className='disease-preview-placeholder'>Preview ready after upload</div>}
 </div>
 <div className='disease-form-actions'>
 <button className='btn' type='button' onClick={() => { setDiseaseImagePreview(''); setDiseaseImageFileName(''); setDiseaseForm(prev => ({ ...prev, image_url: '' })) }}>Clear image</button>
 <button className='btn btn-dark' disabled={diseaseAnalyzing}>{diseaseAnalyzing ? 'FarmSavior is analyzing…' : 'Analyze case'}</button>
 </div>
 </div>
 </form>
 <div className='panel disease-panel disease-tips-panel'>
 <div className='disease-panel-head'>
 <div className='disease-panel-title'>Capture tips</div>
 <div className='disease-panel-pill disease-panel-pill-soft'>Better inputs, better outputs</div>
 </div>
 <div className='disease-tip-list'>
 <div className='disease-tip-item'><strong>1. Keep the subject clear</strong><span>Fill the frame with the affected animal or body area instead of the whole pen.</span></div>
 <div className='disease-tip-item'><strong>2. Add symptom context</strong><span>Mention appetite changes, discharge, lesions, stool changes, fever, or sudden mortality.</span></div>
 <div className='disease-tip-item'><strong>3. Treat AI as triage</strong><span>Use the result to organize next steps, then confirm diagnosis, dosage, and withdrawal periods with a veterinarian.</span></div>
 </div>
 </div>
 </div>
 <div className='disease-results-column'>
 {diseaseAnalyzing && <div className='panel disease-panel disease-status-card'><div className='list-row'><strong>🌿 FarmSavior</strong><span>Analyzing image…</span></div><div className='helper-text'>Please wait while FarmSavior checks the image, compares likely conditions, and prepares treatment guidance.</div></div>}
 {!diseaseAnalyzing && !diseaseResult && <div className='panel disease-panel disease-empty-card'>
 <div className='disease-empty-icon'>🩺</div>
 <strong>No analysis yet</strong>
 <p>Upload a livestock image and run a scan to see the primary assessment, differential matches, and treatment guidance here.</p>
 </div>}
 {diseaseResult && <div className='panel disease-panel disease-results-card'>
 <div className='disease-panel-head'>
 <div>
 <div className='disease-panel-title'>Primary assessment</div>
 <div className='helper-text'>Structured result based on the uploaded livestock image and the symptom notes you provided.</div>
 </div>
 <div className='disease-confidence-badge'>{Math.round((diseaseResult.confidence || 0) * 100)}% confidence</div>
 </div>
 <div className='disease-primary-card'>
 <div>
 <div className='disease-primary-label'>Likely condition</div>
 <div className='disease-primary-diagnosis'>{diseaseResult.diagnosis || 'No diagnosis returned'}</div>
 </div>
 <div className='disease-signal-chip'>{diseaseResult.analysis_signal || 'unknown'}{diseaseResult.insufficient_evidence ? ' · low evidence' : ''}</div>
 </div>
 <div className='disease-detail-grid'>
 <div className='disease-detail-block'>
 <span>How to differentiate</span>
 <p>{Array.isArray(diseaseResult.differentiation) ? diseaseResult.differentiation.join(' • ') : (diseaseResult.differentiation || '-')}</p>
 </div>
 <div className='disease-detail-block'>
 <span>Prevention</span>
 <p>{Array.isArray(diseaseResult.prevention) ? diseaseResult.prevention.join(' • ') : (diseaseResult.prevention || diseaseResult.recommendation || '-')}</p>
 </div>
 <div className='disease-detail-block disease-detail-block-full'>
 <span>Treatment guidance</span>
 <p>{diseaseResult.treatment || '-'}</p>
 </div>
 </div>
 <div className='disease-match-stack'>
 <div className='disease-subsection-title'>Top possible conditions</div>
 {(diseaseResult.top_matches || []).map((m, idx) => <div key={`${m.diagnosis}-${idx}`} className='disease-match-card'>
 <div className='disease-match-head'>
 <strong>{idx + 1}. {m.diagnosis}</strong>
 <span>{Math.round((m.confidence || 0) * 100)}%</span>
 </div>
 <div><strong>Why it matches:</strong> {Array.isArray(m.why_it_matches) && m.why_it_matches.length ? m.why_it_matches.join(' • ') : '-'}</div>
 <div><strong>How to tell apart:</strong> {Array.isArray(m.how_to_tell_apart) ? m.how_to_tell_apart.join(' • ') : (m.how_to_tell_apart || '-')}</div>
 <div><strong>Prevention:</strong> {Array.isArray(m.prevention) ? m.prevention.join(' • ') : (m.prevention || '-')}</div>
 <div><strong>Treatment:</strong> {m.treatment || '-'}</div>
 </div>)}
 {!(diseaseResult.top_matches || []).length && <div className='disease-match-card'><strong>No differential list returned.</strong><div>Run another scan with a clearer photo if you need more comparison detail.</div></div>}
 </div>
 <div className='disease-vet-notice'>{diseaseResult.vet_notice || 'Important: Contact a licensed veterinarian for confirmation before treatment.'}</div>
 </div>}
 <div className='panel disease-panel'>
 <div className='disease-panel-head'>
 <div>
 <div className='disease-panel-title'>Recent analyzer history</div>
 <div className='helper-text'>Animal-only disease scans already saved in the admin database.</div>
 </div>
 <div className='disease-panel-pill disease-panel-pill-soft'>{state.diseaseScans.filter(r => !r.category || String(r.category).toLowerCase() === 'animal').length} records</div>
 </div>
 <DataTable columns={['id','user_id','image_url','result','created_at']} rows={state.diseaseScans.filter(r => !r.category || String(r.category).toLowerCase() === 'animal')} filterKey='result' />
 </div>
 </div>
 </div>
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
 <article className='kpi-card'><p>User management</p><strong>{(state.users || []).length}</strong></article>
 <article className='kpi-card'><p>Crop marketplace monitoring</p><strong>{state.listings.length}</strong></article>
 <article className='kpi-card'><p>Payment tracking</p><strong>{state.payments.length}</strong></article>
 <article className='kpi-card'><p>Logistics monitoring</p><strong>{state.logistics.length}</strong></article>
 <article className='kpi-card'><p>Disputes</p><strong>{state.disputes.length}</strong></article>
 <article className='kpi-card'><p>Fraud flags</p><strong>{state.fraudFlags.length}</strong></article>
 </div>

 <article className='panel'>
 <h3>User Management</h3>
 <DataTable columns={['id','full_name','phone','country','region','role']} rows={state.users || []} filterKey='full_name' />
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

 <footer style={{marginTop:24, padding:'16px 0 8px', fontSize:'.92rem', color:'#64748b', borderTop:'1px solid #e2e8f0'}}>
 FarmSavior is a digital agricultural platform operated in Ghana by Sheep Ghana Limited.
 </footer>

 </main>
 </div>
 </>
}

export default function App() {
 return <AppErrorBoundary><AppInner /></AppErrorBoundary>
}

