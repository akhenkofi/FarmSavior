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
 'Day 0-1: confirm hatchery vaccination declaration and lot records',
 'Day 5-7: Newcastle prime (cold-chain compliant)',
 'Day 10-14: IBD/Gumboro first dose in high-pressure zones',
 'Day 18-24: ND/IBD booster per veterinary directive',
 'Week 6-8: Fowl pox / region-specific vaccines where indicated',
 'Ongoing: deworming/coccidiosis prevention by housing and risk profile'
]


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

const executiveBriefs = {
 poultry: `Poultry University Executive Brief

Professional poultry production succeeds when climate control, feed discipline, vaccination timing, mortality management, and route-to-market are managed as one operating system.

Minister-level message
- Humid systems need litter dryness, drainage, and mycotoxin discipline.
- Dry systems need heat relief, water security, and airflow reliability.
- The most bankable poultry farms are not the biggest; they are the most consistent by tray, cycle, and margin.`,
 sheep: `Sheep University Executive Brief

A serious sheep program combines breeding discipline, lamb survival, parasite control, and measured market grading.

Minister-level message
- Breed improvement must be backed by records, not animal appearance alone.
- Climate-fit management determines whether genetics translate into farmer profit.
- The strongest systems reduce avoidable loss before chasing larger size.`,
 goat: `Goat University Executive Brief

A professional goat enterprise depends on kidding survival, parasite discipline, climate-fit browse strategy, and smart sire selection.

Minister-level message
- WAD resilience must be protected while improving frame and market weight.
- Humid-zone parasite losses can erase the value of better genetics if management is weak.
- Strong goat businesses are built on repeatable kidding and sale batches, not isolated showcase animals.`,
 cattle: `Cattle University Executive Brief

A modern cattle program should be judged by fertility, calf survival, feed-water resilience, and repeatable market weights.

Minister-level message
- Local adaptation is an asset to preserve, not a weakness to replace.
- Climate adaptation, health schedule discipline, and breeding records create the real productivity gains.
- Scalable cattle systems are built through measured herd improvement, not one-off large animals.`
}

function ProfessionalAssets({ product, progress, setProgress, trackKey, openModule }) {
 const completed = (progress?.completed || []).length
 return <>
 <article className='panel' style={{marginTop:10, border:'1.5px solid #334155', background:'#f8fafc'}}>
 <h4 style={{marginTop:0}}>🏛️ Executive / Policy Brief</h4>
 <div className='helper-text' style={{marginBottom:8}}>Designed to feel credible to senior buyers, partners, and public-sector reviewers.</div>
 <div className='inlineForm' style={{flexWrap:'wrap'}}>
 <a className='btn' download={`${product}-Executive-Brief.txt`} href={'data:text/plain;charset=utf-8,' + encodeURIComponent(executiveBriefs[product] || '')}>Download Executive Brief</a>
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
 <div className='list-row'><span>Module 1 outcome</span><strong>Foundation setup defined</strong></div>
 <div className='list-row'><span>Module 2 outcome</span><strong>Breeding / sourcing standard locked</strong></div>
 <div className='list-row'><span>Module 3 outcome</span><strong>Production routine and climate controls clear</strong></div>
 <div className='list-row'><span>Module 4 outcome</span><strong>Health schedule and loss-response system active</strong></div>
 <div className='list-row'><span>Module 5 outcome</span><strong>Commercial scaling rules and records in place</strong></div>
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
 features: ['Everything in Basic', 'Executive briefs, scorecards, and printable templates', 'Progress tracking dashboard', 'Certificate/report path where supported']
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
 const forcePublicView = searchParams.get('public') === '1'
 const authPrompt = searchParams.get('auth') || ''
 const initialSection = (searchParams.get('go') === 'poultry-academy' ? 'poultry-university' : (searchParams.get('go') === 'sheep-academy' ? 'sheep-university' : (searchParams.get('go') === 'goat-academy' ? 'goat-university' : (searchParams.get('go') === 'cattle-academy' ? 'cattle-university' : (searchParams.get('go') || 'home')))))
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
 const [communityPosts, setCommunityPosts] = useState([])
 const [communityFeedMode, setCommunityFeedMode] = useState('for-you')
 const [communityPostForm, setCommunityPostForm] = useState({ text: '', media_url: '', media_type: 'TEXT', tags: '' })
 const [editingCommunityPostId, setEditingCommunityPostId] = useState(null)
 const [communityCommentText, setCommunityCommentText] = useState({})
 const [communityComments, setCommunityComments] = useState({})

 useEffect(() => {
 try { localStorage.setItem('farmsavior_community_profile_cache', JSON.stringify(communityProfile || {})) } catch {}
 }, [communityProfile])

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
 const appScreenOpen = notesComposerOpen || weightComposerOpen || medicinesScreenOpen || medicineShotOpen || medicineChooserOpen || customMedicineComposerOpen || famachaComposerOpen || ancestorTreeOpen || ancestorPdfOpen || offspringReportOpen || offspringListOpen || markComposerOpen || flushComposerOpen || ultrasoundComposerOpen || moveHerdOpen || selectedBreederDetail || breederReportOpen || notesScreenOpen
 const [notesSearch, setNotesSearch] = useState('')
 const [draftNote, setDraftNote] = useState('')
 const [draftWeight, setDraftWeight] = useState('')
 const [livestockRecordsFilter, setLivestockRecordsFilter] = useState('ALL')
 const [recordsSectionOpen, setRecordsSectionOpen] = useState({ create: false, edit: false, batch: false, details: false })
 const [batchMedicationForm, setBatchMedicationForm] = useState({ species:'ALL', animal_type:'ALL', health_status:'ALL', cull_keep_status:'ALL', minStars:'', pen_location:'', medication:'', dose:'', days:'' })
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
 notes: r?.notes || '',
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
 const [showHighDemandProducts, setShowHighDemandProducts] = useState(false)
 const [showHighDemandServices, setShowHighDemandServices] = useState(false)
 const [expandedSpotCommodity, setExpandedSpotCommodity] = useState('')
 const [expandedTradeCommodity, setExpandedTradeCommodity] = useState('')
 const [expandedTradeSections, setExpandedTradeSections] = useState({})
 const [expandedLivestockPlan, setExpandedLivestockPlan] = useState('')
 const [popularActionsOpen, setPopularActionsOpen] = useState(true)
 const [weatherOpen, setWeatherOpen] = useState(true)
 const [newsOpen, setNewsOpen] = useState(true)
 const [spotTradingOpen, setSpotTradingOpen] = useState(true)
 const [governmentProgramsOpen, setGovernmentProgramsOpen] = useState(true)
 const [tradeStatsOpen, setTradeStatsOpen] = useState(true)
 const [livestockSubscription, setLivestockSubscription] = useState({ tier: 'free', status: 'FREE', record_limit: 25, can_create_records: true, subscription: null, plans: [] })
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
 const [goatPlanPreview, setGoatPlanPreview] = useState('basic')
 const [goatTrack, setGoatTrack] = useState('sahelianCross')
 const [goatZone, setGoatZone] = useState('humid')
 const [openGoatModule, setOpenGoatModule] = useState(0)
 const [goatTier, setGoatTier] = useState('free')
 const [goatProgress, setGoatProgress] = useState({ completed: [] })
 const [cattlePlanPreview, setCattlePlanPreview] = useState('basic')
 const [cattleTrack, setCattleTrack] = useState('wadSanga')
 const [cattleZone, setCattleZone] = useState('humid')
 const [openCattleModule, setOpenCattleModule] = useState(0)
 const [cattleTier, setCattleTier] = useState('free')
 const [cattleProgress, setCattleProgress] = useState({ completed: [] })

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

 const handleAnimalPhotoFiles = async (fileList) => {
 const files = Array.from(fileList || []).filter(Boolean)
 if (!files.length) return
 const mapped = files.map((file) => ({ name: file.name, type: file.type || 'image/*', size: file.size }))
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
 const r = await api.checkoutUniversityPlan(product, { user_id: me.id, plan_code: planCode, billing_cycle: 'monthly', currency: 'GHS', country: me?.country || uiCountry })
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
 return
 }
 const sub = await api.fetchLivestockRecordsSubscriptionMe().catch(() => ({ tier: 'free', status: 'FREE', record_limit: 25, can_create_records: true, subscription: null, plans: [] }))
 setLivestockSubscription({
 tier: sub?.tier || 'free',
 status: sub?.status || 'NONE',
 record_limit: sub?.record_limit ?? 0,
 can_create_records: !!sub?.can_create_records,
 subscription: sub?.subscription || null,
 plans: sub?.plans || [],
 trial: sub?.trial || null,
 })
 }

 const loadUniversitySubscriptions = async () => {
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
 const [p, posts] = await Promise.all([
 api.fetchCommunityProfileMe().catch(() => null),
 api.fetchCommunityPosts(80).catch(() => [])
 ])
 if (p && !communityProfileDirty && !communityProfileSaving) {
 setCommunityProfile(p)
 setCommunityProfileBaseline(p)
 }
 setCommunityPosts(posts || [])
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
 }, [token, communityProfileDirty])

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
 <div className='list-row'><span>Poultry University (Layers • Broilers • Guinea Fowl)</span><button type='button' className='btn btn-dark' onClick={()=>handleProtectedAction('poultry-university', 'Poultry University')}>{t('Open','Ouvrir')}</button></div>
 <div className='list-row'><span>Sheep University (Ghana Sheep Breed Program)</span><button type='button' className='btn btn-dark' onClick={()=>handleProtectedAction('sheep-university', 'Sheep University')}>{t('Open','Ouvrir')}</button></div>
 <div className='list-row'><span>Goat University (Ghana Goat Breed Program)</span><button type='button' className='btn btn-dark' onClick={()=>handleProtectedAction('goat-university', 'Goat University')}>{t('Open','Ouvrir')}</button></div>
 <div className='list-row'><span>Cattle University (Ghana Cattle Breed Program)</span><button type='button' className='btn btn-dark' onClick={()=>handleProtectedAction('cattle-university', 'Cattle University')}>{t('Open','Ouvrir')}</button></div>
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
 <h3>{t('🐄 Livestock Records & Intelligence Platform (Africa-Wide)','🐄 Plateforme de registres et d’intelligence du bétail (Afrique entière)','🐄 畜牧记录与智能平台（非洲范围）')}</h3>
 <p style={{fontSize:'.85rem',color:'#475569'}}>{t('A production-grade livestock records system for poultry, sheep, goats, and cattle, with traceability, breeding performance, health tracking, and subscription-based access for operators across Africa.','Un système professionnel de registres d’élevage pour la volaille, les ovins, les caprins et les bovins, avec traçabilité, performance de reproduction, suivi sanitaire et accès par abonnement pour les opérateurs en Afrique.','面向非洲运营者的生产级畜牧记录系统，覆盖家禽、绵羊、山羊和牛，包含溯源、繁育绩效、健康追踪和订阅访问。')}</p>
 <p style={{fontSize:'.82rem',color:'#64748b',marginTop:4}}>{t('Pricing auto-displays in your selected country currency. Settlement can route to Ghana Mobile Money or US bank account once payout details are configured.','Les prix s’affichent automatiquement dans la devise du pays sélectionné. Le règlement peut être acheminé vers Mobile Money Ghana ou un compte bancaire US une fois les détails de paiement configurés.','价格会按你选择的国家货币自动显示。配置收款后，可结算到加纳移动支付或美国银行账户。')}</p>
 <p style={{fontSize:'.85rem',color:'#0f766e',marginTop:6,fontWeight:700}}>Free version allows up to 25 animals total. No photos allowed. No documents allowed.</p>
 <h4 style={{margin:'8px 0'}}>{t('Select Your Subscription Plan','Sélectionnez votre plan d’abonnement','选择你的订阅方案')}</h4>
 <div className='panel' style={{marginBottom:12,padding:12,background:livestockSubscription?.tier==='premium'?'linear-gradient(180deg,#ecfeff 0%,#f0fdfa 100%)':'linear-gradient(180deg,#f8fafc 0%,#f1f5f9 100%)',border:'1px solid #cbd5e1', boxShadow:'0 10px 30px rgba(15,23,42,.05)'}}>
 <strong>Current livestock tier:</strong> {livestockSubscription?.tier==='premium' ? 'PREMIUM' : 'FREE'} • {livestockSubscription?.tier==='premium' ? 'Unlimited animals' : 'Limit 25 animals'}{livestockSubscription?.subscription?.status ? ` • ${livestockSubscription.subscription.status}` : ''}
 </div>
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
 <div className='panel' key={`plan-${i}`} style={{padding:14, background:'linear-gradient(180deg,#ffffff 0%,#f8fafc 100%)', boxShadow:'0 16px 40px rgba(15,23,42,.08)'}}>
 <h4 style={{marginTop:0, fontSize:'1.05rem'}}>{displayPlanName(p.name)}</h4><div className='helper-text' style={{marginBottom:8}}>{p.plan_code === 'free' ? 'Essential entry plan for small holders.' : 'Unlimited premium access for serious operators.'}</div>
 <div className='list-row'><span>{t('Monthly','Mensuel','月付')}</span><strong style={{fontSize:'1.02rem'}}>{formatLocalPrice(p.monthly_usd)}</strong></div>
 <div className='list-row'><span>{t('Yearly','Annuel','年付')}</span><strong style={{fontSize:'1.02rem'}}>{formatLocalPrice(p.yearly_usd)}</strong></div>
 <div className='list'>
 <div className='list-row'><span>{p.record_limit ? `Up to ${p.record_limit} animals total` : 'Unlimited animals'}</span></div>
 {(p.features || []).map((f, j) => <div className='list-row' key={`pf-${i}-${j}`}><span>{displayFeature(f)}</span></div>)}
 {!!p.yearly_savings_pct && <div className='list-row'><span>You save about {p.yearly_savings_pct}% with the yearly plan compared to monthly.</span></div>}
 </div>
 <div className='list-row' style={{marginTop:8, gap:8, flexWrap:'wrap'}}>
 <button className='btn' onClick={() => { if (!token) { handleProtectedAction('onboarding', 'Livestock Free'); return } openLivestockManagement() }}>Use Free Version</button>

 <button className='btn btn-dark' onClick={async () => {
 if (!token) { handleProtectedAction('onboarding', 'Subscription checkout'); return }
 try {
 const r = await api.checkoutLivestockRecordsPlan({
 user_id: Number(me?.id || 1),
 plan_code: p.plan_code || 'premium',
 country: uiCountry,
 billing_cycle: 'monthly',
 currency: selectedCurrency,
 force_paid: true
 })
 if (r.payment_url) {
 try {
 const popup = window.open(r.payment_url, '_blank', 'noopener,noreferrer')
 if (!popup) window.location.assign(r.payment_url)
 } catch { window.location.assign(r.payment_url) }
 alert(t(`Redirecting to secure payment now. Ref: ${r.reference}`,`Redirection vers le paiement sécurisé. Réf : ${r.reference}`))
 } else {
 alert(t(`Checkout created. Ref: ${r.reference}`,`Paiement créé. Réf : ${r.reference}`))
 }
 } catch (e) { alert(t(`Checkout failed: ${errMsg(e)}`,`Échec du paiement : ${errMsg(e)}`)) }
 }}>{t('Buy Premium Now','Acheter Premium','立即购买高级版')}</button>
 </div>
 </div>
 ))}
 </div>
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
 {menu.map(m => <button key={m} className={`sideBtn ${active === m ? 'on' : ''}`} onClick={() => { setActive(m); setMobileMenuOpen(false) }}>{menuLabel(m)}</button>)}
 <button className='sideBtn' onClick={() => { localStorage.removeItem('farmsavior_token'); setToken('') }}>{t('logout','se déconnecter')}</button>
 </aside>
 <main className='main'>
 <div className='mobileTopBar'>
 <button className='btn btn-dark' type='button' onClick={() => setMobileMenuOpen(v => !v)}>{mobileMenuOpen ? 'Close menu' : 'Menu'}</button>
 <strong>FarmSavior</strong>
 <span className='notif-badge'>{state.notifications.filter(n => !n.is_read).length}</span>
 </div>
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
 <button className='btn' onClick={() => setActive('poultry-university')}>Poultry University</button>
 <button className='btn' onClick={() => setActive('sheep-university')}>Sheep University</button>
 <button className='btn' onClick={() => setActive('goat-university')}>Goat University</button>
 <button className='btn' onClick={() => setActive('cattle-university')}>Cattle University</button>
 <button className='btn' onClick={() => setActive('livestock-records')}>{t('Records','Registres','档案')}</button>
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
 <div className='list-row'><span>Farmer Profiles</span><strong>{(state.users || []).filter(u => (u.role||'') === 'Farmer').length}</strong></div>
 <div className='list-row'><span>Growth Signal</span><strong>{(state.users || []).length > 5 ? 'Growing' : 'Early Stage'}</strong></div>
 </article>
 </div>

 <DataTable columns={['id', 'full_name', 'phone', 'country', 'region', 'role']} rows={state.users || []} filterKey='full_name' />
 </section>}

 {active === 'onboarding' && <section className='onboarding-shell'>
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
 <div className='list-row'><span>Current status</span><strong>{verificationStatusLabel(me?.identity_verification_status || myIdVerification?.review?.status || 'NOT_SUBMITTED')}{verificationBadge(me)}</strong></div>
 <div className='list-row'><span>ID type</span><strong>{myIdVerification?.application?.id_type || '-'}</strong></div>
 <div className='list-row'><span>Submitted at</span><strong>{String(myIdVerification?.application?.created_at || myIdVerification?.application?.submitted_at || '-').slice(0, 16)}</strong></div>
 {myIdVerification?.review?.reviewed_at ? <div className='list-row'><span>Reviewed at</span><strong>{String(myIdVerification.review.reviewed_at).slice(0, 16)}</strong></div> : null}
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
 <input className='input' placeholder='ID Number' value={myIdForm.id_number} onChange={e => setMyIdForm({ ...myIdForm, id_number: e.target.value })} />
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
 <input className='input' placeholder='ID Number' value={idForm.id_number} onChange={e => setIdForm({ ...idForm, id_number: e.target.value })} />
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
 <h3>{t('Verification Applications','Demandes de vérification','认证申请')}</h3>
 <button className='btn btn-dark' onClick={async () => { await api.analyzeAllVerifications(); await load(); }}>AI Analyze & Decide All</button>
 </div>
 <DataTable columns={['id_verification_id','full_name','phone','country','id_type','status','ai_score','ai_reason']} rows={state.verificationApps} filterKey='full_name' />
 <div className='list' style={{marginTop:12}}>{state.verificationApps.slice(0, 12).map((app) => <div key={`verify-preview-${app.id_verification_id}`} className='panel' style={{padding:12}}><div style={{fontWeight:700, marginBottom:8}}>{app.full_name} — {verificationStatusLabel(app.status)}{app.status === 'APPROVED' ? ' 🔵' : ''}</div><div className='row2' style={{gap:10}}>{app.id_front_photo_view_url ? <a className='btn' href={api.withAuthToken(app.id_front_photo_view_url)} target='_blank' rel='noreferrer'>View ID Front</a> : <span className='helper-text'>No front image</span>}{app.id_back_photo_view_url ? <a className='btn' href={api.withAuthToken(app.id_back_photo_view_url)} target='_blank' rel='noreferrer'>View ID Back</a> : <span className='helper-text'>No back image</span>}</div></div>)}</div>
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
 <div className='panel' style={{marginBottom:10, background:'#eff6ff', border:'1px solid #bfdbfe'}}><strong>Executive standard:</strong> Poultry University Professional packages the production system in a format suitable for operators, partners, lenders, and policy stakeholders.</div>
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
 <button className='btn btn-dark' onClick={async(e)=>{ e.stopPropagation();
 try {
 if (!token || !me?.id) { handleProtectedAction('onboarding', 'Poultry University Basic checkout'); return }
 const r = await api.checkoutPoultryUniversityPlan({ user_id: me.id, plan_code: 'basic', billing_cycle: 'monthly', currency: 'GHS', country: me?.country || uiCountry })
 setPoultryBillingMsg(r.payment_url ? `Basic checkout created. Redirecting to payment. Ref: ${r.reference}` : (r.payment_init_error || 'Unable to initialize payment right now.'))
 setPoultrySubscription(prev => ({ ...prev, subscription: r.subscription || prev.subscription }))
 if (r.payment_url) window.location.href = r.payment_url
 } catch (e) {
 setPoultryBillingMsg(errMsg(e))
 }
 }}>Buy Basic</button>
 </div>
 <div className='panel' style={{padding:10, border:poultryTier==='pro' || poultryPlanPreview==='pro'?'2px solid #f59e0b':'1px solid #e2e8f0', cursor:'pointer'}} onClick={()=>setPoultryPlanPreview('pro')}>
 <strong>🏆 Professional — ₵120/mo</strong>
 <div style={{fontSize:'.85rem',color:'#475569',margin:'6px 0'}}>Everything in Standard plus executive briefings, benchmark scorecards, printable tools, progress tracking, and certificate outputs.</div>
 <button className='btn btn-dark' onClick={async(e)=>{ e.stopPropagation();
 try {
 if (!token || !me?.id) { handleProtectedAction('onboarding', 'Poultry University Professional checkout'); return }
 const r = await api.checkoutPoultryUniversityPlan({ user_id: me.id, plan_code: 'pro', billing_cycle: 'monthly', currency: 'GHS', country: me?.country || uiCountry })
 setPoultryBillingMsg(r.payment_url ? `Professional checkout created. Redirecting to payment. Ref: ${r.reference}` : (r.payment_init_error || 'Unable to initialize payment right now.'))
 setPoultrySubscription(prev => ({ ...prev, subscription: r.subscription || prev.subscription }))
 if (r.payment_url) window.location.href = r.payment_url
 } catch (e) {
 setPoultryBillingMsg(errMsg(e))
 }
 }}>Buy Professional</button>
 </div>
 </div>
 <div className='panel' style={{marginTop:8,padding:8,background:'#fff7ed',border:'1px solid #fed7aa'}}>
 <strong>{universityPlanPreview[poultryPlanPreview].title} includes:</strong>
 <div className='list' style={{marginTop:6}}>
 {universityPlanPreview[poultryPlanPreview].features.map((feature)=><div className='list-row' key={feature}><span>{feature}</span></div>)}
 </div>
 {poultryPlanPreview !== 'free' && <div style={{marginTop:8}}><button className='btn btn-dark' onClick={()=>startUniversityCheckout('poultry', poultryPlanPreview, `Poultry University ${poultryPlanPreview === 'pro' ? 'Professional' : 'Basic'} checkout`)}>{poultryPlanPreview === 'pro' ? 'Upgrade to Professional' : 'Upgrade to Basic'}</button></div>}
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
 <strong>Professional Deep-Dive:</strong>
 <div className='list-row'><span>Execution checklist by day/week</span></div>
 <div className='list-row'><span>Margin-risk triggers and corrective actions</span></div>
 <div className='list-row'><span>Scale-up criteria before adding next cycle</span></div>
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
 <p style={{fontSize:'.82rem',color:'#64748b',marginTop:8}}>Final vaccine brands/timing must be validated with licensed local veterinary authorities before execution.</p>
 </article>}

 {poultryTier === 'pro' && <article className='panel' style={{marginTop:10, border:'1.5px solid #f59e0b', background:'#fffbeb'}}>
 <h4 style={{marginTop:0}}>🏆 Executive Tools</h4>
 <div className='list'>
 <div className='list-row'><span>Expanded detailed module content</span></div>
 <div className='list-row'><span>AI Disease Analyzer integration (unlimited)</span></div>
 <div className='list-row'><span>Downloadable farm plans</span></div>
 <div className='list-row'><span>Weekly farm management templates</span></div>
 <div className='list-row'><span>Printable vaccination schedules</span></div>
 <div className='list-row'><span>Expert Q&A access</span></div>
 <div className='list-row'><span>Progress tracking dashboard</span></div>
 </div>

 <div className='inlineForm' style={{marginTop:8,flexWrap:'wrap'}}>
 <button className='btn btn-dark' onClick={()=>{setActive('ai-disease'); api.trackAnalyticsEvent({ event_name:'poultry_pro_action', country: uiCountry, role_hint: me?.role || 'user', properties:{action:'open_ai_disease'} }).catch(()=>{})}}>Open AI Disease Analyzer</button>
 <a className='btn' download='Poultry-Expanded-Professional-Guide.txt' href={'data:text/plain;charset=utf-8,'+encodeURIComponent(`Poultry University Professional\nExpanded Detailed Module Guide\n\nLayers\n- Target uniformity before lay and treat weekly weight checks as non-negotiable.\n- Do not push birds into lay before frame and body condition are ready.\n\nBroilers\n- Monitor FCR, floor condition, mortality spikes, and thermal stress daily.\n- Correct waterline height, feeder space, and airflow before blaming feed quality.\n\nGuinea Fowl\n- Prioritize keet survival, predator prevention, and disciplined return-to-house routines.\n\nProfessional Decision Rules\n1. Only scale after two stable cycles.\n2. Fix one bottleneck at a time and re-measure.\n3. Track margin per tray or per bird, not just total sales.\n4. Separate disease pressure, feed waste, and management error before changing strategy.`)}>
 Download Expanded Pro Guide
 </a>
 <a className='btn' download='Poultry-Weekly-Checklist.txt' href={'data:text/plain;charset=utf-8,'+encodeURIComponent('Poultry Weekly Checklist\n- Feed intake check\n- Water quality check\n- Mortality review\n- Biosecurity walk\n- Weight sampling\n- Market prep')}>
 Download Weekly Checklist
 </a>
 <a className='btn' download='Poultry-Farm-Plan.txt' href={'data:text/plain;charset=utf-8,'+encodeURIComponent('Poultry Farm Plan Template\n1) House setup\n2) Input budget\n3) Health calendar\n4) Sales channel map\n5) Scale trigger metrics')}>
 Download Farm Plan
 </a>
 <a className='btn' download='Poultry-Vaccination-Schedule.txt' href={'data:text/plain;charset=utf-8,'+encodeURIComponent(`Poultry Professional Vaccination Schedule\n\nPre-placement\n- Wash/disinfect house\n- Rodent control\n- Verify hatchery records\n\nDay 0-1\n- Arrival checks\n- Confirm hatchery vaccination declaration\n\nDay 5-7\n- Newcastle prime\n\nDay 10-14\n- IBD/Gumboro first dose in high-pressure zones\n\nDay 18-24\n- ND/IBD booster per veterinary directive\n\nWeek 6-8\n- Fowl pox or region-specific vaccines where indicated\n\nOngoing\n- Parasite/coccidiosis prevention\n- Cold-chain compliance\n- Maintain lot/time records\n\nFinal vaccine timing and brands must be confirmed with licensed local veterinary authorities.`)}>
 Download Vaccination Schedule
 </a>
 <a className='btn' download='Poultry-Margin-Risk-Guide.txt' href={'data:text/plain;charset=utf-8,'+encodeURIComponent(`Poultry Professional Margin Risk Guide\n\nTop warning signs\n- Mortality spike above target band\n- Feed wastage above expected range\n- Sudden drop in egg quality or daily collection\n- Heat stress patterns at same time each day\n- Litter moisture and ammonia complaints\n\nCorrective sequence\n1. Verify water and feed access\n2. Inspect airflow and temperature behavior\n3. Check disease signs and isolate weak birds\n4. Review 7-day records before changing feed formula\n5. Re-measure within 72 hours`)}>
 Download Margin-Risk Guide
 </a>
 </div>

 <div className='panel' style={{marginTop:8,padding:8,background:'#fff'}}>
 <strong>Operational Guidance</strong>
 <div className='inlineForm' style={{marginTop:6}}>
 <input className='input' placeholder='Ask your poultry operations question...' value={poultryQuestion} onChange={(e)=>setPoultryQuestion(e.target.value)} />
 <button className='btn' onClick={()=>{
 const q = String(poultryQuestion||'').toLowerCase()
 if (!q) return
 if (q.includes('mortality')) setPoultryAnswer('Focus first on brooding temperature, water hygiene, and immediate isolation of weak birds. Audit first 14-day logs before changing feed plan.')
 else if (q.includes('feed') || q.includes('fcr')) setPoultryAnswer('Track daily feed intake + weight gain by batch. Correct feeder height, reduce wastage, and align phase feed timing with actual bird weights.')
 else if (q.includes('vaccine')) setPoultryAnswer('Use cold-chain compliant vaccines and maintain lot/time records. Confirm final timing with licensed local veterinary guidance before field execution.')
 else setPoultryAnswer('Use the module SOPs: diagnose root cause from daily records, apply one corrective action at a time, and re-measure within 72 hours.')
 }}>Get Guidance</button>
 </div>
 {!!poultryAnswer && <p style={{marginTop:8}}>{poultryAnswer}</p>}
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

 {poultryTier === 'pro' && (poultryProgress.completed||[]).length >= 3 && <article className='panel' style={{marginTop:10, border:'2px solid #eab308', background:'#fefce8'}}>
 <h4 style={{marginTop:0}}>🎓 Certificate of Completion</h4>
 <p>You have completed required professional checkpoints. Your Poultry University certificate is now available.</p>
 <button className='btn btn-dark' onClick={()=>{window.print(); api.trackAnalyticsEvent({ event_name:'poultry_certificate_print', country: uiCountry, role_hint: me?.role || 'user', properties:{completed:(poultryProgress.completed||[]).length} }).catch(()=>{})}}>Print Certificate</button>
 </article>}
 </section>}



 {active === 'sheep-university' && <section>
 <h3>🐑 Sheep University</h3>
 <div className='panel' style={{marginBottom:10, background:'#eff6ff', border:'1px solid #bfdbfe'}}><strong>Executive standard:</strong> Sheep University Professional presents the breeding and operating system in a format suitable for institutional, investor, and policy review.</div>
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
 <div className='panel' style={{padding:10, border:sheepTier==='basic' || sheepPlanPreview==='basic'?'2px solid #16a34a':'1px solid #e2e8f0', cursor:'pointer'}} onClick={()=>setSheepPlanPreview('basic')}>
 <strong>🌿 Basic — ₵50/mo</strong>
 <div style={{fontSize:'.85rem',color:'#475569',margin:'6px 0'}}>Full pillar access, both operating zones, and health schedule guidance.</div>
 <button className='btn btn-dark' onClick={(e)=>{e.stopPropagation(); startUniversityCheckout('sheep', 'basic', 'Sheep University Basic checkout')}}>Unlock Basic</button>
 </div>
 <div className='panel' style={{padding:10, border:sheepTier==='pro' || sheepPlanPreview==='pro'?'2px solid #7c3aed':'1px solid #e2e8f0', cursor:'pointer'}} onClick={()=>setSheepPlanPreview('pro')}>
 <strong>🏆 Professional — ₵120/mo</strong>
 <div style={{fontSize:'.85rem',color:'#475569',margin:'6px 0'}}>Everything in Standard plus executive briefings, benchmark scorecards, printable tools, progress tracking, and certificate outputs.</div>
 <button className='btn btn-dark' onClick={(e)=>{e.stopPropagation(); startUniversityCheckout('sheep', 'pro', 'Sheep University Professional checkout')}}>Go Professional</button>
 </div>
 </div>
 <div className='panel' style={{marginTop:8,padding:8,background:'#faf5ff',border:'1px solid #ddd6fe'}}>
 <strong>{universityPlanPreview[sheepPlanPreview].title} includes:</strong>
 <div className='list' style={{marginTop:6}}>
 {universityPlanPreview[sheepPlanPreview].features.map((feature)=><div className='list-row' key={feature}><span>{feature}</span></div>)}
 </div>
 {sheepPlanPreview !== 'free' && <div style={{marginTop:8}}><button className='btn btn-dark' onClick={()=>startUniversityCheckout('sheep', sheepPlanPreview, `Sheep University ${sheepPlanPreview === 'pro' ? 'Professional' : 'Basic'} checkout`)}>{sheepPlanPreview === 'pro' ? 'Upgrade to Professional' : 'Upgrade to Basic'}</button></div>}
 </div>
 </article>
 {universitySubscriptions.sheep?.subscription?.status === 'PENDING_PAYMENT' && <div className='panel' style={{marginTop:8,padding:8,background:'#eff6ff',border:'1px solid #bfdbfe'}}><strong>Payment pending.</strong> Reference: {universitySubscriptions.sheep.subscription.reference}. <button className='btn btn-dark' style={{marginLeft:8}} onClick={()=>verifyUniversityCheckout('sheep')}>Verify Payment</button></div>}
 {universitySubscriptions.sheep?.subscription?.status === 'ACTIVE' && <div className='panel' style={{marginTop:8,padding:8,background:'#ecfeff',border:'1px solid #99f6e4'}}><strong>{String(universitySubscriptions.sheep.subscription.plan_code || '').toUpperCase()} active.</strong> Server-side subscription verified.</div>}
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
 </article>}

 {sheepTier === 'pro' && <article className='panel' style={{marginTop:10,border:'1.5px solid #7c3aed',background:'#faf5ff'}}>
 <h4 style={{marginTop:0}}>🏆 Executive Tools</h4>
 <div className='list'>
 <div className='list-row'><span>Expanded breeding decision frameworks</span></div>
 <div className='list-row'><span>Printable mating + lambing calendars</span></div>
 <div className='list-row'><span>Weekly flock management templates</span></div>
 <div className='list-row'><span>Progress tracking dashboard</span></div>
 </div>
 <div className='inlineForm' style={{marginTop:8, flexWrap:'wrap'}}>
 <a className='btn' download='Sheep-Breeding-Decision-Framework.txt' href={'data:text/plain;charset=utf-8,'+encodeURIComponent(`Sheep University Professional\nExpanded Breeding Decision Frameworks\n\n1. Breeding Objective\n- Define whether flock goal is meat, breeding stock, hardiness, or cross improvement.\n- Select rams and ewes only after ranking fertility, growth, mothering, and survival history.\n\n2. Ewe Selection Gate\n- Keep only ewes with strong conception history, good mothering, healthy udder/teat structure, and acceptable body condition.\n- Cull low-fertility, repeated-abortion, chronic-foot, or poor-mothering lines.\n\n3. Ram Selection Gate\n- Prioritize structural soundness, growth rate, fertility signs, feet/legs, and line consistency.\n- Use only one improvement target per season: size, hardiness, carcass, or maternal performance.\n\n4. Mating Group Logic\n- Match rams to ewe groups by breeding objective and avoid random mixing.\n- Track sire-to-group allocation and target lambing windows.\n\n5. Replacement Logic\n- Retain replacement females from top-performing dams only.\n- Remove weak-line animals early to avoid hidden cost buildup.\n\n6. Performance Review\n- Review conception rate, lamb survival, weaning weights, and margin before next mating cycle.\n- Expand only after two stable cycles with acceptable mortality and fertility.`)}>Download Decision Frameworks</a>
 <a className='btn' download='Sheep-Mating-Lambing-Calendar.txt' href={'data:text/plain;charset=utf-8,'+encodeURIComponent(`Sheep University Professional\nPrintable Mating + Lambing Calendar\n\nMonth 1\n- Body condition scoring\n- Flush ewes\n- Health check and parasite control\n- Confirm ram readiness\n\nMonth 2\n- Controlled mating window opens\n- Record mating groups and dates\n- Remove weak or non-performing breeders\n\nMonth 3\n- Pregnancy observation and nutrition adjustment\n- Track returns to heat\n\nMonth 4\n- Mid-pregnancy health review\n- Mineral and water consistency\n\nMonth 5\n- Pre-lambing housing prep\n- Birth kit and isolation pen ready\n\nMonth 6\n- Lambing supervision\n- Colostrum checks\n- Neonatal survival log\n\nMonth 7\n- Lamb growth review\n- Dam recovery assessment\n\nMonth 8\n- Weaning and replacement selection\n- Sale/retention decisions\n\nUse this calendar as a printable cycle tracker and adapt months to your actual breeding season.`)}>Download Mating + Lambing Calendar</a>
 <a className='btn' download='Sheep-Weekly-Flock-Management-Template.txt' href={'data:text/plain;charset=utf-8,'+encodeURIComponent(`Sheep University Professional\nWeekly Flock Management Template\n\nWeek Of: __________\nFarm/Unit: __________\nManager: __________\n\n1. Stock Summary\n- Total ewes: _____\n- Total rams: _____\n- Lambs/kids: _____\n- Sick animals: _____\n- Deaths this week: _____\n\n2. Breeding Notes\n- Heat observed: _____\n- Matings recorded: _____\n- Suspected returns: _____\n\n3. Health Checks\n- Parasite signs: Yes / No\n- Lameness cases: _____\n- Treatments given: __________\n\n4. Nutrition & Water\n- Feed quality acceptable: Yes / No\n- Water reliability acceptable: Yes / No\n- Mineral supplementation: Yes / No\n\n5. Housing & Biosecurity\n- Pens cleaned: Yes / No\n- Isolation pen used: Yes / No\n- Fence/perimeter checked: Yes / No\n\n6. Growth & Performance\n- Sample weights taken: Yes / No\n- Weak animals flagged: Yes / No\n\n7. Action Items Next Week\n- __________________________________\n- __________________________________\n- __________________________________`)}>Download Weekly Flock Template</a>
 <button className='btn' onClick={()=>setSheepProgress((s)=>({ ...s, completed: Array.from(new Set([...(s.completed||[]), `${sheepTrack}:${openSheepModule}`])) }))}>Mark Current Module Complete</button>
 <div className='list-row' style={{padding:'6px 10px', background:'#fff'}}><span>Completed checkpoints</span><strong>{(sheepProgress.completed||[]).length}</strong></div>
 </div>
 </article>}

 {sheepTier === 'pro' && <ProfessionalAssets product='sheep' progress={sheepProgress} setProgress={setSheepProgress} trackKey={sheepTrack} openModule={openSheepModule} />}

 {sheepTier === 'pro' && (sheepProgress.completed||[]).length >= 3 && <article className='panel' style={{marginTop:10, border:'2px solid #7c3aed', background:'#f5f3ff'}}>
 <h4 style={{marginTop:0}}>🎓 Certificate of Completion</h4>
 <p>You have completed required sheep-program checkpoints. Certificate is ready.</p>
 <button className='btn btn-dark' onClick={()=>window.print()}>Print Certificate</button>
 </article>}
 </section>}



 {active === 'goat-university' && <section>
 <h3>🐐 Goat University</h3>
 <div className='panel' style={{marginBottom:10, background:'#eff6ff', border:'1px solid #bfdbfe'}}><strong>Executive standard:</strong> Goat University Professional presents the breeding and operating system in a format suitable for institutional, investor, and policy review.</div>
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
 <button className='btn btn-dark' onClick={(e)=>{e.stopPropagation(); startUniversityCheckout('goat', 'basic', 'Goat University Basic checkout')}}>Unlock Basic</button>
 </div>
 <div className='panel' style={{padding:10, border:goatTier==='pro' || goatPlanPreview==='pro'?'2px solid #0d9488':'1px solid #e2e8f0', cursor:'pointer'}} onClick={()=>setGoatPlanPreview('pro')}>
 <strong>🏆 Professional — ₵120/mo</strong>
 <div style={{fontSize:'.85rem',color:'#475569',margin:'6px 0'}}>Everything in Standard plus executive briefings, benchmark scorecards, printable tools, progress tracking, and certificate outputs.</div>
 <button className='btn btn-dark' onClick={(e)=>{e.stopPropagation(); startUniversityCheckout('goat', 'pro', 'Goat University Professional checkout')}}>Go Professional</button>
 </div>
 </div>
 <div className='panel' style={{marginTop:8,padding:8,background:'#f0fdfa',border:'1px solid #99f6e4'}}>
 <strong>{universityPlanPreview[goatPlanPreview].title} includes:</strong>
 <div className='list' style={{marginTop:6}}>
 {universityPlanPreview[goatPlanPreview].features.map((feature)=><div className='list-row' key={feature}><span>{feature}</span></div>)}
 </div>
 {goatPlanPreview !== 'free' && <div style={{marginTop:8}}><button className='btn btn-dark' onClick={()=>startUniversityCheckout('goat', goatPlanPreview, `Goat University ${goatPlanPreview === 'pro' ? 'Professional' : 'Basic'} checkout`)}>{goatPlanPreview === 'pro' ? 'Upgrade to Professional' : 'Upgrade to Basic'}</button></div>}
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
 <p style={{fontSize:'.82rem',color:'#64748b',marginTop:8}}>Goat-specific warning: CCPP and Haemonchus risks require strict routine monitoring.</p>
 </article>}

 {goatTier === 'pro' && <article className='panel' style={{marginTop:10,border:'1.5px solid #0d9488',background:'#ecfeff'}}>
 <h4 style={{marginTop:0}}>🏆 Executive Tools</h4>
 <div className='list'>
 <div className='list-row'><span>Browse resource mapping toolkit</span></div>
 <div className='list-row'><span>Printable breeding + health templates</span></div>
 <div className='list-row'><span>Advanced terminal-sire selection framework</span></div>
 <div className='list-row'><span>Progress tracking dashboard</span></div>
 <div className='list-row'><span>Minister-grade expansion notes for breed, market, and climate decisions</span></div>
 </div>
 <div className='inlineForm' style={{marginTop:8,flexWrap:'wrap'}}>
 <a className='btn' download='Goat-Breed-Strategy-Framework.txt' href={'data:text/plain;charset=utf-8,'+encodeURIComponent(`Goat University Professional\nExpanded Breed Strategy Framework\n\n1. Commercial objective\n- Decide whether the unit is targeting breeding stock, festive meat, female replacement sales, or terminal finishing.\n- Match the breeding objective to one dominant KPI: fertility, kid survival, frame growth, or carcass value.\n\n2. Foundation-doe selection\n- Keep only does with reliable kidding history, acceptable udder structure, parasite resilience, and strong mothering.\n- Separate survival genetics from feeding advantage: high-performing does under poor conditions are more valuable than animals that only perform under expensive feeding.\n\n3. Buck strategy\n- Sahelian-type bucks: use when frame and height are the immediate target.\n- Red Sokoto/Maradi-type bucks: use when market preference, twinning tendency, and maternal productivity matter.\n- Boer/Kalahari/Savannah terminal sires: use only after the adapted maternal base is stable.\n\n4. Climate discipline\n- Humid systems must prioritize parasite control, hoof health, shelter dryness, and browse rotation.\n- Dry systems must prioritize water security, heat stress relief, drought feed buffers, and respiratory control.\n\n5. Scale rule\n- Expand only after two kidding cycles show acceptable kid survival, parasite control, and sale margins.`)}>Download Breed Strategy Framework</a>
 <a className='btn' download='Goat-Breeding-Health-Calendar.txt' href={'data:text/plain;charset=utf-8,'+encodeURIComponent(`Goat University Professional\nBreeding + Health Calendar\n\nPre-breeding\n- Body condition score all does and bucks\n- Correct mineral gaps and parasite burden\n- Repair pens, kidding areas, and water points\n\nBreeding window\n- Controlled buck rotation\n- Record mating groups by line\n- Remove weak breeders and note returns to heat\n\nPregnancy phase\n- Trimester feeding plan\n- Low-stress handling and housing review\n- Prepare kidding kits and isolation pens\n\nKidding phase\n- Colostrum checks within hours\n- Twin-kid support and weak-kid watch\n- Doe recovery monitoring\n\nPost-kidding / grow-out\n- Parasite checks, CCPP watch, growth sampling\n- Weaning by weight + health, not age alone\n- Replacement and sale grading decisions`)}>Download Breeding + Health Calendar</a>
 <a className='btn' download='Goat-Professional-Operating-Guide.txt' href={'data:text/plain;charset=utf-8,'+encodeURIComponent(`Goat University Professional\nProfessional Operating Guide\n\nModule expansion notes\n- Module 1: Build a target genotype map and define the role of each line before mating.\n- Module 2: Treat buck selection as a profit decision, not a beauty contest.\n- Module 3: Kidding survival rises when labor, pen hygiene, and doe energy status are controlled before birth.\n- Module 4: In humid systems, Haemonchus control discipline determines whether the enterprise scales safely.\n- Module 5: Track margin per doe exposed, per kid weaned, and per kilogram sold.\n\nExecutive decision rules\n1. Replace does from your best dams, not from random survivors.\n2. Never use terminal sires to mask weak management.\n3. Build market batches by weight class and body condition, not by age guesswork.\n4. Keep a seasonal drought or parasite contingency plan written down before trouble starts.`)}>Download Professional Operating Guide</a>
 <button className='btn' onClick={()=>setGoatProgress((s)=>({ ...s, completed: Array.from(new Set([...(s.completed||[]), `${goatTrack}:${openGoatModule}`])) }))}>Mark Current Module Complete</button>
 <div className='list-row' style={{padding:'6px 10px', background:'#fff'}}><span>Completed checkpoints</span><strong>{(goatProgress.completed||[]).length}</strong></div>
 </div>
 </article>}

 {goatTier === 'pro' && <ProfessionalAssets product='goat' progress={goatProgress} setProgress={setGoatProgress} trackKey={goatTrack} openModule={openGoatModule} />}

 {goatTier === 'pro' && (goatProgress.completed||[]).length >= 3 && <article className='panel' style={{marginTop:10, border:'2px solid #0d9488', background:'#f0fdfa'}}>
 <h4 style={{marginTop:0}}>🎓 Certificate of Completion</h4>
 <p>You have completed required goat-program checkpoints. Certificate is ready.</p>
 <button className='btn btn-dark' onClick={()=>window.print()}>Print Certificate</button>
 </article>}
 </section>}



 {active === 'cattle-university' && <section>
 <h3>🐄 Cattle University</h3>
 <div className='panel' style={{marginBottom:10, background:'#eff6ff', border:'1px solid #bfdbfe'}}><strong>Executive standard:</strong> Cattle University Professional presents the herd-improvement system in a format suitable for institutional, investor, and policy review.</div>
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
 <button className='btn btn-dark' onClick={(e)=>{e.stopPropagation(); startUniversityCheckout('cattle', 'basic', 'Cattle University Basic checkout')}}>Unlock Basic</button>
 </div>
 <div className='panel' style={{padding:10, border:cattleTier==='pro' || cattlePlanPreview==='pro'?'2px solid #d97706':'1px solid #e2e8f0', cursor:'pointer'}} onClick={()=>setCattlePlanPreview('pro')}>
 <strong>🏆 Professional — ₵120/mo</strong>
 <div style={{fontSize:'.85rem',color:'#475569',margin:'6px 0'}}>Everything in Standard plus executive briefings, benchmark scorecards, printable tools, progress tracking, and certificate outputs.</div>
 <button className='btn btn-dark' onClick={(e)=>{e.stopPropagation(); startUniversityCheckout('cattle', 'pro', 'Cattle University Professional checkout')}}>Go Professional</button>
 </div>
 </div>
 <div className='panel' style={{marginTop:8,padding:8,background:'#fffbeb',border:'1px solid #fde68a'}}>
 <strong>{universityPlanPreview[cattlePlanPreview].title} includes:</strong>
 <div className='list' style={{marginTop:6}}>
 {universityPlanPreview[cattlePlanPreview].features.map((feature)=><div className='list-row' key={feature}><span>{feature}</span></div>)}
 </div>
 {cattlePlanPreview !== 'free' && <div style={{marginTop:8}}><button className='btn btn-dark' onClick={()=>startUniversityCheckout('cattle', cattlePlanPreview, `Cattle University ${cattlePlanPreview === 'pro' ? 'Professional' : 'Basic'} checkout`)}>{cattlePlanPreview === 'pro' ? 'Upgrade to Professional' : 'Upgrade to Basic'}</button></div>}
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
 </article>}

 {cattleTier === 'pro' && <article className='panel' style={{marginTop:10,border:'1.5px solid #d97706',background:'#fff7ed'}}>
 <h4 style={{marginTop:0}}>🏆 Executive Tools</h4>
 <div className='list'>
 <div className='list-row'><span>Advanced herd selection matrix</span></div>
 <div className='list-row'><span>Printable breeding and calving templates</span></div>
 <div className='list-row'><span>Progress tracking dashboard</span></div>
 <div className='list-row'><span>Expanded professional brief suitable for policy, investor, and executive review</span></div>
 </div>
 <div className='inlineForm' style={{marginTop:8,flexWrap:'wrap'}}>
 <a className='btn' download='Cattle-Herd-Selection-Matrix.txt' href={'data:text/plain;charset=utf-8,'+encodeURIComponent(`Cattle University Professional\nAdvanced Herd Selection Matrix\n\n1. Cow base selection\n- Retain cows with reliable calving history, mothering ability, acceptable fertility, and resilience under local feed pressure.\n- Separate survival genetics from subsidy feeding effects. A cow that breeds and raises calves consistently under field conditions is more valuable than a high-cost show animal.\n\n2. Bull decision framework\n- Sahelian/Zebu influence: frame and growth improvement.\n- White Fulani/Sudanese influence: dual-purpose market appeal and structure.\n- Brahman/Gudali terminal sires: use only when maternal base and management are already stable.\n\n3. Herd replacement logic\n- Keep heifers from top-calving cows with strong weaning results.\n- Cull repeated calving trouble, weak mothering, poor fertility, or chronic disease lines.\n\n4. Scale logic\n- Expand only after calving interval, calf survival, and feed security are stable across seasons.`)}>Download Herd Selection Matrix</a>
 <a className='btn' download='Cattle-Breeding-Calving-Playbook.txt' href={'data:text/plain;charset=utf-8,'+encodeURIComponent(`Cattle University Professional\nBreeding + Calving Playbook\n\nPre-breeding\n- Body condition review\n- Bull soundness and fertility checks\n- Water, mineral, and fodder planning\n\nBreeding season\n- Controlled bull groups and service records\n- Heat observation and re-service notes\n- Remove poor breeders quickly\n\nPregnancy management\n- Stage-based nutrition and stress control\n- Vaccination and parasite schedule by veterinary guidance\n- Calving pen and labor prep before due dates cluster\n\nCalving phase\n- Calving watch, colostrum assurance, and calf vigor checks\n- Postpartum recovery and mastitis watch\n- Early calf disease response plan\n\nPost-calving growth period\n- Tick and blood-parasite control\n- Sample weight tracking and weak-line intervention\n- Replacement vs sale decision review`)}>Download Breeding + Calving Playbook</a>
 <a className='btn' download='Cattle-Professional-Executive-Brief.txt' href={'data:text/plain;charset=utf-8,'+encodeURIComponent(`Cattle University Professional\nExecutive Brief\n\nThis program is designed for serious herd builders who want a Ghana-adapted commercial cattle line with stronger carcass, better resilience, and more disciplined breeding records.\n\nProfessional operating priorities\n- Convert every breeding season into a measurable economic review.\n- Track conception, calving interval, calf survival, growth, and margin by cohort.\n- Build feed and water buffers before the dry season rather than reacting during crisis.\n- Treat disease surveillance as an executive KPI, not only as a veterinary issue.\n\nPolicy and investor message\n- The herd model aims to protect local adaptation while improving output.\n- The business case depends on lower mortality, tighter selection, and market-class consistency.\n- Long-run value comes from repeatable herd performance, not one-off large animals.\n\nMinister-level takeaway\n- A disciplined cattle system combines genetics, climate adaptation, health scheduling, and market records into one measurable production strategy.`)}>Download Executive Brief</a>
 <button className='btn' onClick={()=>setCattleProgress((s)=>({ ...s, completed: Array.from(new Set([...(s.completed||[]), `${cattleTrack}:${openCattleModule}`])) }))}>Mark Current Module Complete</button>
 <div className='list-row' style={{padding:'6px 10px', background:'#fff'}}><span>Completed checkpoints</span><strong>{(cattleProgress.completed||[]).length}</strong></div>
 </div>
 </article>}

 {cattleTier === 'pro' && <ProfessionalAssets product='cattle' progress={cattleProgress} setProgress={setCattleProgress} trackKey={cattleTrack} openModule={openCattleModule} />}

 {cattleTier === 'pro' && (cattleProgress.completed||[]).length >= 3 && <article className='panel' style={{marginTop:10, border:'2px solid #d97706', background:'#fff7ed'}}>
 <h4 style={{marginTop:0}}>🎓 Certificate of Completion</h4>
 <p>You have completed required cattle-program checkpoints. Certificate is ready.</p>
 <button className='btn btn-dark' onClick={()=>window.print()}>Print Certificate</button>
 </article>}
 </section>}

 {active === 'livestock-records' && <section>
 <div className='panel' style={{marginBottom:12, padding:'12px 14px', background:'#1d4ed8', color:'#fff'}}>
 <div className='list-row' style={{alignItems:'center', gap:12}}>
 <div>
 <h3 style={{margin:0, color:'#fff'}}>{t('Livestock Records Management (Sheep • Goats • Cattle • Poultry)','Gestion des registres élevage (ovins • caprins • bovins • volailles)','牲畜档案管理（羊•山羊•牛•家禽）')}</h3>
 <div style={{fontSize:'.82rem', opacity:.9}}>{livestockRecordsFiltered.length} visible</div>
 </div>
 <button type='button' className='btn' style={{marginLeft:'auto', minWidth:48, height:48, borderRadius:999, fontSize:'1.6rem', fontWeight:700, background:'#fff', color:'#1d4ed8', border:'none'}} onClick={() => setRecordsSectionOpen(prev => ({ ...prev, create: true, edit: false }))}>+</button>
 </div>
 </div>
 <div className='panel' style={{marginBottom:12, width:'100%'}}>
 <div className='list-row' style={{alignItems:'center', gap:12}}>
 <strong>{t('Records overview','Aperçu des registres','记录概览')}</strong>
 <div className='helper-text'>{livestockRecordsFiltered.length} visible</div>
 </div>
 </div>
 <div className='panel' style={{width:'100%'}}>
 <div className='inlineForm' style={{flexWrap:'wrap', width:'100%'}}>
 <button type='button' className='btn' onClick={() => setLivestockRecordsFilter('ALL')} style={{border:livestockRecordsFilter==='ALL'?'2px solid #0f766e':'1px solid #cbd5e1'}}>{t('Total records','Total registres','记录总数')}: {state.livestockRecords.length}</button>
 <button type='button' className='btn' onClick={() => setLivestockRecordsFilter('GOAT')} style={{border:livestockRecordsFilter==='GOAT'?'2px solid #0f766e':'1px solid #cbd5e1'}}>{t('Goats','Chèvres','山羊')}: {state.livestockRecords.filter(r => r.species === 'GOAT').length}</button>
 <button type='button' className='btn' onClick={() => setLivestockRecordsFilter('SHEEP')} style={{border:livestockRecordsFilter==='SHEEP'?'2px solid #0f766e':'1px solid #cbd5e1'}}>{t('Sheep','Moutons','绵羊')}: {state.livestockRecords.filter(r => r.species === 'SHEEP').length}</button>
 <button type='button' className='btn' onClick={() => setLivestockRecordsFilter('CATTLE')} style={{border:livestockRecordsFilter==='CATTLE'?'2px solid #0f766e':'1px solid #cbd5e1'}}>{t('Cattle','Bovins','牛')}: {state.livestockRecords.filter(r => r.species === 'CATTLE').length}</button>
 <button type='button' className='btn' onClick={() => setLivestockRecordsFilter('POULTRY')} style={{border:livestockRecordsFilter==='POULTRY'?'2px solid #0f766e':'1px solid #cbd5e1'}}>{t('Poultry','Volailles','家禽')}: {state.livestockRecords.filter(r => r.species === 'POULTRY').length}</button>
 </div>
 <div className='inlineForm' style={{marginTop:10, flexWrap:'wrap'}}>
 <button type='button' className='btn btn-dark' onClick={() => setRecordsSectionOpen(prev => ({ ...prev, create: !prev.create, edit: false }))}>{recordsSectionOpen.create ? 'Close Create Record' : 'Create Record'}</button>
 <button type='button' className='btn' onClick={() => selectedLivestockRecord ? setRecordsSectionOpen(prev => ({ ...prev, edit: !prev.edit, create: false })) : alert('Select a record to edit first')}>{recordsSectionOpen.edit ? 'Close Edit Record' : 'Edit Selected Record'}</button>
 </div>
 <p style={{margin:'8px 0 0',fontSize:'.82rem',color:'#475569'}}>Showing: <strong>{livestockRecordsFilter}</strong> ({livestockRecordsFiltered.length} records)</p>
 </div>

 <article className='panel' style={{width:'100%', overflow:'hidden'}}>
 <div className='list-row' style={{marginBottom:10}}>
 <div style={{cursor:'pointer'}} onClick={() => setRecordsSectionOpen(prev => ({ ...prev, create: !prev.create, edit: false }))}>
 <h4 style={{margin:'0 0 4px 0'}}>Create Record</h4>
 <div className='helper-text'>Tap the + button to open this add-record flow immediately.</div>
 </div>
 <button type='button' className='btn' onClick={() => setRecordsSectionOpen(prev => ({ ...prev, create: !prev.create, edit: false }))}>{recordsSectionOpen.create ? 'Hide' : 'Open'}</button>
 </div>
 {recordsSectionOpen.create && <form className='list' style={{gap:10, width:'100%'}} onSubmit={async e => {
 e.preventDefault()
 try {
 const { treatment_entry, ...createPayload } = livestockRecordForm
 await api.createLivestockRecord({
 ...createPayload,
 user_id: Number(me?.id || 0),
 stars: Number(livestockRecordForm.stars || 0),
 purchase_price: livestockRecordForm.purchase_price === '' ? null : Number(livestockRecordForm.purchase_price),
 litter_size: livestockRecordForm.litter_size === '' ? null : Number(livestockRecordForm.litter_size),
 initial_weight_kg: livestockRecordForm.initial_weight_kg === '' ? null : Number(livestockRecordForm.initial_weight_kg),
 sale_price: livestockRecordForm.sale_price === '' ? null : Number(livestockRecordForm.sale_price),
 date_of_birth: livestockRecordForm.date_of_birth || null,
 acquisition_date: livestockRecordForm.acquisition_date || null,
 sale_date: livestockRecordForm.sale_date || null,
 died_date: livestockRecordForm.died_date || null,
 })
 await load()
 setLivestockRecordForm({ ...livestockRecordForm, name: '', ear_tag: '', registration_number: '', purchased_from: '', purchase_price: '', health_status: '', notes: '', treatment_entry: '' })
 setRecordsSectionOpen(prev => ({ ...prev, create: false }))
 alert('Record created successfully')
 } catch (err) {
 alert(`Create failed: ${errMsg(err)}`)
 }
 }}>
 <div className='panel' style={{padding:'10px 12px', background:'#ffffff', border:'1px solid #dbeafe', borderRadius:16, boxShadow:'0 8px 24px rgba(15,23,42,.06)'}}>
 <div className='list-row' style={{alignItems:'center', gap:12}}>
 <button type='button' className='btn' style={{borderRadius:999}} onClick={() => setRecordsSectionOpen(prev => ({ ...prev, create: false }))}>Cancel</button>
 <strong style={{fontSize:'1.05rem', marginLeft:'auto', marginRight:'auto'}}>{`Add ${String(livestockRecordForm.species || 'Record').charAt(0)}${String(livestockRecordForm.species || 'Record').slice(1).toLowerCase()}`}</strong>
 <button type='submit' className='btn btn-dark' style={{borderRadius:999}}>Done</button>
 </div>
 </div>
 <div className='panel' style={{padding:12, background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:16, boxShadow:'0 6px 18px rgba(15,23,42,.04)'}}>
 <div className='helper-text' style={{fontWeight:700, color:'#1e3a8a', marginBottom:6}}>Quick identity and ownership</div>
 </div>
 <div className='row2' style={{gap:10}}>
 <label style={{display:'grid', gap:4}}>
 <span className='helper-text' style={{fontWeight:700, color:'#334155'}}>Ownership</span>
 <select className='input' value={livestockRecordForm.ownership} onChange={e => setLivestockRecordForm({ ...livestockRecordForm, ownership: e.target.value })}><option value='OWNED'>Owned by me</option><option value='THIRD_PARTY'>Owned by someone else</option></select>
 </label>
 <label style={{display:'grid', gap:4}}>
 <span className='helper-text' style={{fontWeight:700, color:'#334155'}}>Animal type</span>
 <select className='input' value={livestockRecordForm.species} onChange={e => setLivestockRecordForm({ ...livestockRecordForm, species: e.target.value, animal_type: e.target.value === 'GOAT' ? 'DOE' : (e.target.value === 'CATTLE' ? 'COW' : (e.target.value === 'POULTRY' ? 'LAYER_HEN' : 'EWE')) })}><option value='SHEEP'>Sheep</option><option value='GOAT'>Goat</option><option value='CATTLE'>Cattle</option><option value='POULTRY'>Poultry</option></select>
 </label>
 </div>
 <label style={{display:'grid', gap:4}}>
 <span className='helper-text' style={{fontWeight:700, color:'#334155'}}>{livestockRecordForm.species === 'POULTRY' ? 'Sex / category' : 'Sex'}</span>
 <select className='input' value={livestockRecordForm.animal_type} onChange={e => setLivestockRecordForm({ ...livestockRecordForm, animal_type: e.target.value })}>{livestockRecordForm.species === 'GOAT' ? <><option value='DOE'>Doe</option><option value='BUCK'>Buck</option></> : (livestockRecordForm.species === 'CATTLE' ? <><option value='COW'>Cow</option><option value='BULL'>Bull</option><option value='HEIFER'>Heifer</option><option value='STEER'>Steer</option></> : (livestockRecordForm.species === 'POULTRY' ? <><option value='LAYER_HEN'>Layer hen</option><option value='BROILER'>Broiler</option><option value='PULLET'>Pullet</option><option value='COCKEREL'>Cockerel</option><option value='CHICK'>Chick</option><option value='BREEDER'>Breeder</option></> : <><option value='EWE'>Ewe</option><option value='RAM'>Ram</option></>))}</select>
 </label>
 <div className='row2' style={{gap:10}}>
 <label style={{display:'grid', gap:4}}>
 <span className='helper-text'>Reg. Name</span>
 <input className='input' placeholder='Registration name' value={livestockRecordForm.name} onChange={e => setLivestockRecordForm({ ...livestockRecordForm, name: e.target.value })} />
 </label>
 <label style={{display:'grid', gap:4}}>
 <span className='helper-text'>Breed</span>
 <select className='input' value={livestockRecordForm.breeding_type || ''} onChange={e => setLivestockRecordForm({ ...livestockRecordForm, breeding_type: e.target.value })}>
 <option value=''>Choose breed</option>
 {(livestockBreedOptions[livestockRecordForm.species] || []).map(b => <option key={`breed-${b}`} value={b}>{b}</option>)}
 </select>
 </label>
 </div>
 <div className='row2' style={{gap:10}}>
 <label style={{display:'grid', gap:4}}>
 <span className='helper-text'>Breeder</span>
 <input className='input' list='livestock-purchase-sources-create' placeholder='Choose or enter breeder' value={livestockRecordForm.purchased_from} onChange={e => setLivestockRecordForm({ ...livestockRecordForm, purchased_from: e.target.value, purchased_from_type: 'BREEDER' })} />
 </label>
 <label style={{display:'grid', gap:4}}>
 <span className='helper-text'>Stars</span>
 <select className='input' value={livestockRecordForm.stars} onChange={e => setLivestockRecordForm({ ...livestockRecordForm, stars: e.target.value })}>
 <option value='0'>0 stars</option><option value='1'>1 star</option><option value='2'>2 stars</option><option value='3'>3 stars</option><option value='4'>4 stars</option><option value='5'>5 stars</option>
 </select>
 </label>
 </div>
 <datalist id='livestock-purchase-sources-create'>{state.livestockPurchaseSources.filter(s => !s.species || s.species === 'ALL' || s.species === livestockRecordForm.species).map(s => <option key={`create-source-${s.id}-${s.name}`} value={s.name}>{s.source_type || ''}</option>)}</datalist>
 <div className='row2' style={{gap:10}}>
 <label style={{display:'grid', gap:4}}>
 <span className='helper-text'>Born</span>
 <input className='input' type='date' value={livestockRecordForm.date_of_birth} onChange={e => setLivestockRecordForm({ ...livestockRecordForm, date_of_birth: e.target.value })} />
 </label>
 <label style={{display:'grid', gap:4}}>
 <span className='helper-text'>Acquired</span>
 <input className='input' type='date' value={livestockRecordForm.acquisition_date} onChange={e => setLivestockRecordForm({ ...livestockRecordForm, acquisition_date: e.target.value })} />
 </label>
 </div>
 <div className='row2' style={{gap:10}}>
 <label style={{display:'grid', gap:4}}>
 <span className='helper-text'>Purchase Cost</span>
 <input className='input' type='number' step='0.01' placeholder='0.00' value={livestockRecordForm.purchase_price} onChange={e => setLivestockRecordForm({ ...livestockRecordForm, purchase_price: e.target.value })} />
 </label>
 <label style={{display:'grid', gap:4}}>
 <span className='helper-text'>Purchase Desc</span>
 <input className='input' placeholder='Market / private treaty / gifted' value={livestockRecordForm.notes} onChange={e => setLivestockRecordForm({ ...livestockRecordForm, notes: e.target.value })} />
 </label>
 </div>
 <div className='row2' style={{gap:10}}>
 <label style={{display:'grid', gap:4}}>
 <span className='helper-text'>Sire</span>
 <input className='input' placeholder='Choose or enter sire' value={livestockRecordForm.sire_id} onChange={e => setLivestockRecordForm({ ...livestockRecordForm, sire_id: e.target.value })} />
 </label>
 <label style={{display:'grid', gap:4}}>
 <span className='helper-text'>Dam</span>
 <input className='input' placeholder='Choose or enter dam' value={livestockRecordForm.dam_id} onChange={e => setLivestockRecordForm({ ...livestockRecordForm, dam_id: e.target.value })} />
 </label>
 </div>
 <div className='row2' style={{gap:10}}>
 <label style={{display:'grid', gap:4}}>
 <span className='helper-text'>Dam-Sire</span>
 <input className='input' placeholder='Dam sire / maternal grandsire' value={livestockRecordForm.farm_id} onChange={e => setLivestockRecordForm({ ...livestockRecordForm, farm_id: e.target.value })} />
 </label>
 <label style={{display:'grid', gap:4}}>
 <span className='helper-text'>Raised by Dam</span>
 <select className='input' value={livestockRecordForm.cull_keep_status || ''} onChange={e => setLivestockRecordForm({ ...livestockRecordForm, cull_keep_status: e.target.value })}>
 <option value=''>Choose</option>
 {livestockRaisedByDamOptions.map(opt => <option key={`raised-${opt}`} value={opt}>{opt}</option>)}
 </select>
 </label>
 </div>
 <div className='row2' style={{gap:10}}>
 <label style={{display:'grid', gap:4}}>
 <span className='helper-text'>Litter Size</span>
 <input className='input' type='number' min='0' placeholder='0' value={livestockRecordForm.litter_size} onChange={e => setLivestockRecordForm({ ...livestockRecordForm, litter_size: e.target.value })} />
 </label>
 <label style={{display:'grid', gap:4}}>
 <span className='helper-text'>DNA</span>
 <select className='input' value={livestockRecordForm.registration_number || ''} onChange={e => setLivestockRecordForm({ ...livestockRecordForm, registration_number: e.target.value })}>
 <option value=''>Choose DNA status</option>
 {livestockDnaOptions.map(opt => <option key={`dna-${opt}`} value={opt}>{opt}</option>)}
 </select>
 </label>
 </div>
 <div className='row2' style={{gap:10}}>
 <label style={{display:'grid', gap:4}}>
 <span className='helper-text'>Initial Weight</span>
 <input className='input' type='number' step='0.01' placeholder='kg' value={livestockRecordForm.initial_weight_kg} onChange={e => setLivestockRecordForm({ ...livestockRecordForm, initial_weight_kg: e.target.value })} />
 </label>
 <label style={{display:'grid', gap:4}}>
 <span className='helper-text'>Currency</span>
 <select className='input' value={livestockRecordForm.currency} onChange={e => setLivestockRecordForm({ ...livestockRecordForm, currency: e.target.value })}><option>GHS</option><option>NGN</option><option>XOF</option><option>USD</option></select>
 </label>
 </div>
 <button type='button' className='btn' onClick={async () => {
 const name = (livestockRecordForm.purchased_from || '').trim()
 if (!name) return alert('Enter breeder name first')
 try {
 await api.saveLivestockPurchaseSource({ user_id: Number(me?.id || 0), species: livestockRecordForm.species, name, source_type: 'BREEDER' })
 await loadLivestockRecords()
 alert('Breeder saved')
 } catch (err) {
 alert(`Could not save breeder: ${errMsg(err)}`)
 }
 }}>Save breeder</button>
 <label style={{display:'grid', gap:4}}>
 <span className='helper-text'>Initial Notes</span>
 <textarea className='input' rows={3} placeholder='Notes' value={livestockRecordForm.notes} onChange={e => setLivestockRecordForm({ ...livestockRecordForm, notes: e.target.value })} />
 </label>
 <div className='panel' style={{padding:12, background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:16, boxShadow:'0 6px 18px rgba(15,23,42,.04)'}}>
 <div className='helper-text' style={{fontWeight:700, color:'#475569', marginBottom:8}}>Breeding Type</div>
 <div className='inlineForm' style={{gap:8, flexWrap:'wrap'}}>
 {['Natural','AI Fresh','AI Frozen','ET'].map(opt => (
 <button type='button' key={`breedtype-${opt}`} className={`btn ${livestockRecordForm.health_status===opt ? 'btn-dark' : ''}`} onClick={() => setLivestockRecordForm({ ...livestockRecordForm, health_status: opt })}>{opt}</button>
 ))}
 </div>
 </div>
 <div className='row2' style={{gap:10}}>
 <label style={{display:'grid', gap:4}}>
 <span className='helper-text'>Castrated</span>
 <select className='input' value={livestockRecordForm.castrated ? 'Yes' : 'No'} onChange={e => setLivestockRecordForm({ ...livestockRecordForm, castrated: e.target.value === 'Yes' })}><option>No</option><option>Yes</option></select>
 </label>
 <label style={{display:'grid', gap:4}}>
 <span className='helper-text'>Sale Date</span>
 <input className='input' type='date' value={livestockRecordForm.sale_date} onChange={e => setLivestockRecordForm({ ...livestockRecordForm, sale_date: e.target.value })} />
 </label>
 </div>
 <div className='row2' style={{gap:10}}>
 <label style={{display:'grid', gap:4}}>
 <span className='helper-text'>Sold To</span>
 <input className='input' placeholder='Choose' value={livestockRecordForm.sold_to} onChange={e => setLivestockRecordForm({ ...livestockRecordForm, sold_to: e.target.value })} />
 </label>
 <label style={{display:'grid', gap:4}}>
 <span className='helper-text'>Sale Price</span>
 <input className='input' type='number' step='0.01' placeholder='$ Amount' value={livestockRecordForm.sale_price} onChange={e => setLivestockRecordForm({ ...livestockRecordForm, sale_price: e.target.value })} />
 </label>
 </div>
 <div className='row2' style={{gap:10}}>
 <label style={{display:'grid', gap:4}}>
 <span className='helper-text'>Sale Desc</span>
 <input className='input' placeholder='Sale Desc (Optional)' value={livestockRecordForm.pen_location} onChange={e => setLivestockRecordForm({ ...livestockRecordForm, pen_location: e.target.value })} />
 </label>
 <label style={{display:'grid', gap:4}}>
 <span className='helper-text'>Winnings</span>
 <input className='input' placeholder='Winnings' value={livestockRecordForm.treatment_entry} onChange={e => setLivestockRecordForm({ ...livestockRecordForm, treatment_entry: e.target.value })} />
 </label>
 </div>
 <div className='row2' style={{gap:10}}>
 <label style={{display:'grid', gap:4}}>
 <span className='helper-text'>Died</span>
 <input className='input' type='date' value={livestockRecordForm.died_date} onChange={e => setLivestockRecordForm({ ...livestockRecordForm, died_date: e.target.value })} />
 </label>
 <label style={{display:'grid', gap:4}}>
 <span className='helper-text'>Breed With</span>
 <input className='input' placeholder='Choose' value={livestockRecordForm.cull_reason} onChange={e => setLivestockRecordForm({ ...livestockRecordForm, cull_reason: e.target.value })} />
 </label>
 </div>
 <div className='panel' style={{padding:12, background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:16, boxShadow:'0 6px 18px rgba(15,23,42,.04)'}}>
 <div className='helper-text' style={{fontWeight:700, color:'#475569', marginBottom:8}}>Should Be Culled</div>
 <div className='inlineForm' style={{gap:8}}>
 <button type='button' className={`btn ${livestockRecordForm.cull_keep_status==='CULL' ? 'btn-dark' : ''}`} onClick={() => setLivestockRecordForm({ ...livestockRecordForm, cull_keep_status: 'CULL' })}>Cull</button>
 <button type='button' className={`btn ${livestockRecordForm.cull_keep_status==='KEEP' ? 'btn-dark' : ''}`} onClick={() => setLivestockRecordForm({ ...livestockRecordForm, cull_keep_status: 'KEEP' })}>Keep</button>
 </div>
 </div>
 <button className='btn btn-dark' style={{borderRadius:999, padding:'12px 18px'}}>Create Record</button>
 </form>}
 </article>

 <article className='panel'>
 <div className='list-row' style={{marginBottom:10}}>
 <div style={{cursor:(selectedLivestockRecord || livestockRecordEdit.id) ? 'pointer' : 'default'}} onClick={() => {
 if (!(selectedLivestockRecord || livestockRecordEdit.id)) return
 setRecordsSectionOpen(prev => ({ ...prev, edit: !prev.edit, create: false }))
 }}>
 <h4 style={{margin:'0 0 4px 0'}}>Edit Record</h4>
 <div className='helper-text'>{selectedLivestockRecord ? 'Tap Edit from the table below to prefill this form automatically.' : 'Select a record from the table first.'}</div>
 </div>
 <button type='button' className='btn' disabled={!selectedLivestockRecord && !livestockRecordEdit.id} onClick={() => setRecordsSectionOpen(prev => ({ ...prev, edit: !prev.edit, create: false }))}>{recordsSectionOpen.edit ? 'Hide' : 'Open'}</button>
 </div>
 {(recordsSectionOpen.edit && (selectedLivestockRecord || livestockRecordEdit.id)) && <form className='list' onSubmit={async e => {
 e.preventDefault()
 if (!livestockRecordEdit.id) return
 try {
 const { treatment_entry, ...editPayload } = livestockRecordEdit
 await api.updateLivestockRecord(Number(livestockRecordEdit.id), {
 ...editPayload,
 user_id: Number(livestockRecordEdit.user_id || me?.id || 1),
 stars: Number(livestockRecordEdit.stars || 0),
 purchase_price: livestockRecordEdit.purchase_price === '' ? null : Number(livestockRecordEdit.purchase_price),
 litter_size: livestockRecordEdit.litter_size === '' ? null : Number(livestockRecordEdit.litter_size),
 initial_weight_kg: livestockRecordEdit.initial_weight_kg === '' ? null : Number(livestockRecordEdit.initial_weight_kg),
 sale_price: livestockRecordEdit.sale_price === '' ? null : Number(livestockRecordEdit.sale_price),
 date_of_birth: livestockRecordEdit.date_of_birth || null,
 acquisition_date: livestockRecordEdit.acquisition_date || null,
 sale_date: livestockRecordEdit.sale_date || null,
 died_date: livestockRecordEdit.died_date || null,
 })
 await load()
 setRecordsSectionOpen(prev => ({ ...prev, edit: false }))
 alert('Record updated successfully')
 } catch (err) {
 alert(`Update failed: ${errMsg(err)}`)
 }
 }}>
 <input className='input' placeholder='Record ID' value={livestockRecordEdit.id} onChange={e => setLivestockRecordEdit({ ...livestockRecordEdit, id: e.target.value })} required />
 <div className='row2' style={{gap:10}}>
 <select className='input' value={livestockRecordEdit.species} onChange={e => setLivestockRecordEdit({ ...livestockRecordEdit, species: e.target.value, animal_type: e.target.value === 'GOAT' ? 'DOE' : (e.target.value === 'CATTLE' ? 'COW' : (e.target.value === 'POULTRY' ? 'LAYER_HEN' : 'EWE')) })}><option value='SHEEP'>SHEEP</option><option value='GOAT'>GOAT</option><option value='CATTLE'>CATTLE</option><option value='POULTRY'>POULTRY</option></select>
 <select className='input' value={livestockRecordEdit.animal_type} onChange={e => setLivestockRecordEdit({ ...livestockRecordEdit, animal_type: e.target.value })}>{livestockRecordEdit.species === 'GOAT' ? <><option value='DOE'>DOE</option><option value='BUCK'>BUCK</option></> : (livestockRecordEdit.species === 'CATTLE' ? <><option value='COW'>COW</option><option value='BULL'>BULL</option><option value='HEIFER'>HEIFER</option><option value='STEER'>STEER</option></> : (livestockRecordEdit.species === 'POULTRY' ? <><option value='LAYER_HEN'>LAYER_HEN</option><option value='BROILER'>BROILER</option><option value='PULLET'>PULLET</option><option value='COCKEREL'>COCKEREL</option><option value='CHICK'>CHICK</option><option value='BREEDER'>BREEDER</option></> : <><option value='EWE'>EWE</option><option value='RAM'>RAM</option></>))}</select>
 </div>
 <div className='row2' style={{gap:10}}>
 <input className='input' placeholder='Name' value={livestockRecordEdit.name} onChange={e => setLivestockRecordEdit({ ...livestockRecordEdit, name: e.target.value })} />
 <input className='input' placeholder='Ear tag' value={livestockRecordEdit.ear_tag} onChange={e => setLivestockRecordEdit({ ...livestockRecordEdit, ear_tag: e.target.value })} />
 </div>
 <div className='row2' style={{gap:10}}>
 <input className='input' placeholder='Farm ID' value={livestockRecordEdit.farm_id} onChange={e => setLivestockRecordEdit({ ...livestockRecordEdit, farm_id: e.target.value })} />
 <input className='input' placeholder='Registration number' value={livestockRecordEdit.registration_number} onChange={e => setLivestockRecordEdit({ ...livestockRecordEdit, registration_number: e.target.value })} />
 </div>
 <div className='row2' style={{gap:10}}>
 <label style={{display:'grid', gap:4}}>
 <span className='helper-text'>Date of birth</span>
 <input className='input' type='date' value={livestockRecordEdit.date_of_birth ? String(livestockRecordEdit.date_of_birth).slice(0,10) : ''} onChange={e => setLivestockRecordEdit({ ...livestockRecordEdit, date_of_birth: e.target.value })} />
 </label>
 <label style={{display:'grid', gap:4}}>
 <span className='helper-text'>Date purchased</span>
 <input className='input' type='date' value={livestockRecordEdit.acquisition_date ? String(livestockRecordEdit.acquisition_date).slice(0,10) : ''} onChange={e => setLivestockRecordEdit({ ...livestockRecordEdit, acquisition_date: e.target.value })} />
 </label>
 </div>
 <div className='row2' style={{gap:10}}>
 <input className='input' list='livestock-purchase-sources-edit' placeholder='Purchased from' value={livestockRecordEdit.purchased_from} onChange={e => setLivestockRecordEdit({ ...livestockRecordEdit, purchased_from: e.target.value })} />
 <select className='input' value={livestockRecordEdit.purchased_from_type} onChange={e => setLivestockRecordEdit({ ...livestockRecordEdit, purchased_from_type: e.target.value })}><option value='BREEDER'>Breeder</option><option value='MARKET'>Market</option><option value='OTHER'>Other</option></select>
 </div>
 <datalist id='livestock-purchase-sources-edit'>{state.livestockPurchaseSources.filter(s => !s.species || s.species === 'ALL' || s.species === livestockRecordEdit.species).map(s => <option key={`edit-source-${s.id}-${s.name}`} value={s.name}>{s.source_type || ''}</option>)}</datalist>
 <div className='row2' style={{gap:10}}>
 <input className='input' type='number' step='0.01' placeholder='Purchase price' value={livestockRecordEdit.purchase_price} onChange={e => setLivestockRecordEdit({ ...livestockRecordEdit, purchase_price: e.target.value })} />
 <select className='input' value={livestockRecordEdit.currency} onChange={e => setLivestockRecordEdit({ ...livestockRecordEdit, currency: e.target.value })}><option>GHS</option><option>NGN</option><option>XOF</option><option>USD</option></select>
 </div>
 <button type='button' className='btn' onClick={async () => {
 const name = (livestockRecordEdit.purchased_from || '').trim()
 if (!name) return alert('Enter breeder or market name first')
 try {
 await api.saveLivestockPurchaseSource({ user_id: Number(me?.id || 0), species: livestockRecordEdit.species, name, source_type: livestockRecordEdit.purchased_from_type || 'OTHER' })
 await loadLivestockRecords()
 alert('Breeder/market saved')
 } catch (err) {
 alert(`Could not save breeder/market: ${errMsg(err)}`)
 }
 }}>Save breeder / market</button>
 <div className='row2' style={{gap:10}}>
 <input className='input' type='number' min='0' max='5' placeholder='Stars (0-5)' value={livestockRecordEdit.stars} onChange={e => setLivestockRecordEdit({ ...livestockRecordEdit, stars: e.target.value })} />
 <input className='input' type='number' step='0.01' placeholder='Initial weight (kg)' value={livestockRecordEdit.initial_weight_kg} onChange={e => setLivestockRecordEdit({ ...livestockRecordEdit, initial_weight_kg: e.target.value })} />
 </div>
 <div className='row2' style={{gap:10}}>
 <input className='input' placeholder={livestockRecordEdit.species === 'POULTRY' ? 'Breeder line / rooster ID' : 'Sire ID'} value={livestockRecordEdit.sire_id} onChange={e => setLivestockRecordEdit({ ...livestockRecordEdit, sire_id: e.target.value })} />
 <input className='input' placeholder={livestockRecordEdit.species === 'POULTRY' ? 'Hatchery batch / hen line' : 'Dam ID'} value={livestockRecordEdit.dam_id} onChange={e => setLivestockRecordEdit({ ...livestockRecordEdit, dam_id: e.target.value })} />
 </div>
 <div className='row2' style={{gap:10}}>
 <input className='input' type='number' min='0' placeholder={livestockRecordEdit.species === 'POULTRY' ? 'Flock/batch size' : 'Litter size'} value={livestockRecordEdit.litter_size} onChange={e => setLivestockRecordEdit({ ...livestockRecordEdit, litter_size: e.target.value })} />
 <input className='input' placeholder={livestockRecordEdit.species === 'POULTRY' ? 'Production type (layer/broiler/breeder)' : 'Breeding type'} value={livestockRecordEdit.breeding_type} onChange={e => setLivestockRecordEdit({ ...livestockRecordEdit, breeding_type: e.target.value })} />
 </div>
 <div className='row2' style={{gap:10}}>
 <input className='input' placeholder='Health status' value={livestockRecordEdit.health_status} onChange={e => setLivestockRecordEdit({ ...livestockRecordEdit, health_status: e.target.value })} />
 <input className='input' placeholder='Pen location' value={livestockRecordEdit.pen_location} onChange={e => setLivestockRecordEdit({ ...livestockRecordEdit, pen_location: e.target.value })} />
 </div>
 {livestockRecordEdit.species !== 'POULTRY' && <label><input type='checkbox' checked={livestockRecordEdit.castrated} onChange={e => setLivestockRecordEdit({ ...livestockRecordEdit, castrated: e.target.checked })} /> Castrated</label>}
 <div className='row2' style={{gap:10}}>
 <input className='input' placeholder='Cull/keep status' value={livestockRecordEdit.cull_keep_status} onChange={e => setLivestockRecordEdit({ ...livestockRecordEdit, cull_keep_status: e.target.value })} />
 <input className='input' placeholder='Cull reason' value={livestockRecordEdit.cull_reason} onChange={e => setLivestockRecordEdit({ ...livestockRecordEdit, cull_reason: e.target.value })} />
 </div>
 <div className='row2' style={{gap:10}}>
 <input className='input' type='date' placeholder='Sale date' value={livestockRecordEdit.sale_date ? String(livestockRecordEdit.sale_date).slice(0,10) : ''} onChange={e => setLivestockRecordEdit({ ...livestockRecordEdit, sale_date: e.target.value })} />
 <input className='input' type='number' step='0.01' placeholder='Sale price' value={livestockRecordEdit.sale_price} onChange={e => setLivestockRecordEdit({ ...livestockRecordEdit, sale_price: e.target.value })} />
 </div>
 <div className='row2' style={{gap:10}}>
 <input className='input' placeholder='Sold to' value={livestockRecordEdit.sold_to} onChange={e => setLivestockRecordEdit({ ...livestockRecordEdit, sold_to: e.target.value })} />
 <input className='input' type='date' placeholder='Died date' value={livestockRecordEdit.died_date ? String(livestockRecordEdit.died_date).slice(0,10) : ''} onChange={e => setLivestockRecordEdit({ ...livestockRecordEdit, died_date: e.target.value })} />
 </div>
 <div className='inlineForm'>
 <input className='input' placeholder='Medication / treatment record (single entry)' value={livestockRecordEdit.treatment_entry} onChange={e => setLivestockRecordEdit({ ...livestockRecordEdit, treatment_entry: e.target.value })} />
 <button type='button' className='btn' onClick={() => {
 if (!livestockRecordEdit.treatment_entry?.trim()) return
 const stamp = new Date().toISOString().slice(0,10)
 const line = `[Treatment ${stamp}] ${livestockRecordEdit.treatment_entry.trim()}`
 setLivestockRecordEdit({ ...livestockRecordEdit, notes: [livestockRecordEdit.notes, line].filter(Boolean).join('\n'), treatment_entry: '' })
 }}>Add Treatment</button>
 </div>
 <input className='input' placeholder='Notes (includes treatment history)' value={livestockRecordEdit.notes} onChange={e => setLivestockRecordEdit({ ...livestockRecordEdit, notes: e.target.value })} />
 <div className='inlineForm'>
 <button className='btn btn-dark'>Save Edit</button>
 <button type='button' className='btn' onClick={async () => { try { if (!livestockRecordEdit.id) return; await api.deleteLivestockRecord(Number(livestockRecordEdit.id)); await load(); setLivestockRecordEdit({ ...livestockRecordEdit, id: '' }); setSelectedLivestockRecord(null); setRecordsSectionOpen(prev => ({ ...prev, edit: false, details: false })); alert('Record deleted successfully') } catch (err) { alert(`Delete failed: ${errMsg(err)}`) } }}>Delete Record</button>
 </div>
 </form>}
 </article>

 <article className='panel'>
 <div className='list-row' style={{marginBottom:10}}>
 <div>
 <h4 style={{margin:'0 0 4px 0'}}>Batch Medication / Treatment</h4>
 <div className='helper-text'>Apply one treatment note to multiple matching records.</div>
 </div>
 <button type='button' className='btn' onClick={() => setRecordsSectionOpen(prev => ({ ...prev, batch: !prev.batch }))}>{recordsSectionOpen.batch ? 'Hide' : 'Open'}</button>
 </div>
 {recordsSectionOpen.batch && <>
 <div className='inlineForm'>
 <select className='input' value={batchMedicationForm.species} onChange={e=>setBatchMedicationForm({ ...batchMedicationForm, species:e.target.value, animal_type:'ALL' })}>
 <option value='ALL'>All species</option>
 <option value='SHEEP'>SHEEP</option>
 <option value='GOAT'>GOAT</option>
 <option value='CATTLE'>CATTLE</option>
 </select>
 <select className='input' value={batchMedicationForm.animal_type} onChange={e=>setBatchMedicationForm({ ...batchMedicationForm, animal_type:e.target.value })}>
 <option value='ALL'>All animal types</option>
 {(batchMedicationForm.species === 'ALL' || batchMedicationForm.species === 'SHEEP') && <><option value='EWE'>EWE</option><option value='RAM'>RAM</option></>}
 {(batchMedicationForm.species === 'ALL' || batchMedicationForm.species === 'GOAT') && <><option value='DOE'>DOE</option><option value='BUCK'>BUCK</option></>}
 {(batchMedicationForm.species === 'ALL' || batchMedicationForm.species === 'CATTLE') && <><option value='COW'>COW</option><option value='BULL'>BULL</option><option value='HEIFER'>HEIFER</option><option value='STEER'>STEER</option></>}
 {(batchMedicationForm.species === 'ALL' || batchMedicationForm.species === 'POULTRY') && <><option value='LAYER_HEN'>LAYER_HEN</option><option value='BROILER'>BROILER</option><option value='PULLET'>PULLET</option><option value='COCKEREL'>COCKEREL</option><option value='CHICK'>CHICK</option><option value='BREEDER'>BREEDER</option></>}
 </select>
 <select className='input' value={batchMedicationForm.health_status} onChange={e=>setBatchMedicationForm({ ...batchMedicationForm, health_status:e.target.value })}>
 <option value='ALL'>All health statuses</option>
 <option value='Healthy'>Healthy</option>
 <option value='Monitor'>Monitor</option>
 <option value='Sick'>Sick</option>
 </select>
 <select className='input' value={batchMedicationForm.cull_keep_status} onChange={e=>setBatchMedicationForm({ ...batchMedicationForm, cull_keep_status:e.target.value })}>
 <option value='ALL'>All cull/keep statuses</option>
 <option value='KEEP'>KEEP</option>
 <option value='CULL'>CULL</option>
 </select>
 </div>
 <div className='inlineForm'>
 <input className='input' type='number' min='0' max='5' placeholder='Min stars (optional)' value={batchMedicationForm.minStars} onChange={e=>setBatchMedicationForm({ ...batchMedicationForm, minStars:e.target.value })} />
 <input className='input' placeholder='Pen/location contains (optional)' value={batchMedicationForm.pen_location} onChange={e=>setBatchMedicationForm({ ...batchMedicationForm, pen_location:e.target.value })} />
 <input className='input' placeholder='Medication name' value={batchMedicationForm.medication} onChange={e=>setBatchMedicationForm({ ...batchMedicationForm, medication:e.target.value })} />
 <input className='input' placeholder='Dose (optional)' value={batchMedicationForm.dose} onChange={e=>setBatchMedicationForm({ ...batchMedicationForm, dose:e.target.value })} />
 <input className='input' placeholder='Duration days (optional)' value={batchMedicationForm.days} onChange={e=>setBatchMedicationForm({ ...batchMedicationForm, days:e.target.value })} />
 </div>
 <div className='inlineForm'>
 <button type='button' className='btn btn-dark' onClick={async () => {
 try {
 if (!batchMedicationForm.medication?.trim()) return alert('Medication name is required')
 const minStars = batchMedicationForm.minStars === '' ? null : Number(batchMedicationForm.minStars)
 const matches = state.livestockRecords.filter(r => {
 if (batchMedicationForm.species !== 'ALL' && r.species !== batchMedicationForm.species) return false
 if (batchMedicationForm.animal_type !== 'ALL' && r.animal_type !== batchMedicationForm.animal_type) return false
 if (batchMedicationForm.health_status !== 'ALL' && String(r.health_status || '') !== batchMedicationForm.health_status) return false
 if (batchMedicationForm.cull_keep_status !== 'ALL' && String(r.cull_keep_status || '') !== batchMedicationForm.cull_keep_status) return false
 if (minStars != null && Number(r.stars || 0) < minStars) return false
 if (batchMedicationForm.pen_location?.trim() && !String(r.pen_location || '').toLowerCase().includes(batchMedicationForm.pen_location.trim().toLowerCase())) return false
 return true
 })
 if (!matches.length) return alert('No matching records for current filters')
 const stamp = new Date().toISOString().slice(0,10)
 const line = `[Batch Treatment ${stamp}] ${batchMedicationForm.medication}${batchMedicationForm.dose ? ` | Dose: ${batchMedicationForm.dose}` : ''}${batchMedicationForm.days ? ` | Days: ${batchMedicationForm.days}` : ''}`
 let ok = 0, fail = 0
 for (const r of matches) {
 try {
 await api.updateLivestockRecord(Number(r.id), { ...r, notes: [r.notes, line].filter(Boolean).join('\\n') })
 ok += 1
 } catch {
 fail += 1
 }
 }
 await load()
 alert(`Batch treatment applied. Success: ${ok}, Failed: ${fail}`)
 } catch (err) {
 alert(`Batch update failed: ${errMsg(err)}`)
 }
 }}>Apply Batch Treatment</button>
 <div className='list-row' style={{padding:'6px 10px'}}>
 <span>Matching records (preview)</span>
 <strong>{state.livestockRecords.filter(r => {
 const minStars = batchMedicationForm.minStars === '' ? null : Number(batchMedicationForm.minStars)
 if (batchMedicationForm.species !== 'ALL' && r.species !== batchMedicationForm.species) return false
 if (batchMedicationForm.animal_type !== 'ALL' && r.animal_type !== batchMedicationForm.animal_type) return false
 if (batchMedicationForm.health_status !== 'ALL' && String(r.health_status || '') !== batchMedicationForm.health_status) return false
 if (batchMedicationForm.cull_keep_status !== 'ALL' && String(r.cull_keep_status || '') !== batchMedicationForm.cull_keep_status) return false
 if (minStars != null && Number(r.stars || 0) < minStars) return false
 if (batchMedicationForm.pen_location?.trim() && !String(r.pen_location || '').toLowerCase().includes(batchMedicationForm.pen_location.trim().toLowerCase())) return false
 return true
 }).length}</strong>
 </div>
 </div>
 </>}
 </article>


 {(selectedOffspringRecord || selectedLivestockRecord) && <article className='panel' style={{padding:0, overflow:'auto', position:'fixed', inset:'0', zIndex:9999, maxWidth:560, margin:'0 auto', left:0, right:0, background:'#fff', borderRadius:0}}>
 <div style={{background:'#1d4ed8', color:'#fff', padding:'12px 14px', display:'flex', alignItems:'center', gap:12}}>
 <button type='button' className='btn' style={{background:'transparent', color:'#fff', border:'none', padding:0}} onClick={() => { if (selectedOffspringRecord) setSelectedOffspringRecord(null); else setSelectedLivestockRecord(null) }}>‹</button>
 <strong style={{fontSize:'1.05rem'}}>{selectedOffspringRecord ? 'Offspring' : (String((selectedOffspringRecord || selectedLivestockRecord).species || 'Animal').charAt(0) + String((selectedOffspringRecord || selectedLivestockRecord).species || 'Animal').slice(1).toLowerCase())}</strong>
 <div style={{marginLeft:'auto', fontWeight:700}}>{(selectedOffspringRecord || selectedLivestockRecord)?.name || (selectedOffspringRecord || selectedLivestockRecord)?.id || '0001'}</div>
 <button type='button' className='btn' style={{background:'transparent', color:'#fff', border:'none'}} onClick={() => { const baseRecord = selectedOffspringRecord || selectedLivestockRecord; setLivestockRecordEdit(mapLivestockRecordToEditForm(baseRecord)); setRecordsSectionOpen(prev => ({ ...prev, edit: true, create: false, details: true })) }}>Edit</button>
 </div>
 {recordsSectionOpen.details && <div style={{background:'#fff'}}>
 {livestockDetailRows(selectedOffspringRecord || selectedLivestockRecord).map((row, idx) => {
 const [label, value, action] = row
 const clickable = action === 'breeder' && value && value !== '--'
 return <div key={`detail-${label}-${idx}`} className='list-row' style={{padding:'14px 16px', borderBottom:'1px solid #eef2f7', alignItems:'center', cursor: clickable ? 'pointer' : 'default'}} onClick={() => {
 if (!clickable) return
 const baseRecord = selectedOffspringRecord || selectedLivestockRecord
 setBreederUploads({ photos: [], docs: [] })
 setSelectedBreederDetail({
 id: String(baseRecord?.id || '0001').padStart(4,'0'),
 name: value,
 phone: '--',
 email: '--',
 address: '--',
 scrapiePrefix: '--',
 notes: '--',
 })
 }}>
 <span style={{color:'#1e3a8a', fontWeight:600}}>{label}</span>
 <strong style={{marginLeft:'auto', color:'#111827', textAlign:'right'}}>{value == null || value === '' ? '--' : String(value)}</strong>
 {clickable && <span style={{marginLeft:10, color:'#9ca3af'}}>›</span>}
 </div>
 })}
 <div style={{padding:'12px 16px', background:'#eef4ff', color:'#6b7280', fontWeight:700, letterSpacing:'.02em'}}>HISTORY</div>
 {livestockHistoryRows(selectedLivestockRecord).history.map((row, idx) => {
 const [label, value, action] = row
 const clickable = action === 'notes' || action === 'add-note' || action === 'add-weight' || action === 'medicines' || action === 'add-medicine' || action === 'famacha' || action === 'ancestor-tree' || action === 'share-pdf' || action === 'offspring-report' || action === 'offspring-list' || action === 'add-mark' || action === 'add-flush'
 return <div key={`history-${label}-${idx}`} className='list-row' style={{padding:'14px 16px', borderBottom:'1px solid #eef2f7', alignItems:'center', cursor: clickable ? 'pointer' : 'default'}} onClick={() => {
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
 if (action === 'add-mark') { const base=(selectedOffspringRecord || selectedLivestockRecord); setMarkDraft({ sire: base?.sire_id || '', dam: base?.dam_id || base?.id || '', markDate: new Date().toISOString().slice(0,10), dueDate: '2026-08-26', fertilizationType: 'Natural' }); setMarkComposerOpen(true) }
 if (action === 'add-flush') { const base=(selectedOffspringRecord || selectedLivestockRecord); setFlushDraft({ ram: base?.sire_id || '', date: new Date().toISOString().slice(0,10), cidrIn: '', cidrOut: '', notes: '' }); setFlushComposerOpen(true) }
 }}>
 <span style={{color:'#111827', fontWeight:600}}>{label} {String(value).startsWith('(') ? value : ''}</span>
 <strong style={{marginLeft:'auto', color:'#9ca3af', textAlign:'right'}}>{String(value).startsWith('(') ? '›' : value}</strong>
 </div>
 })}
 <div style={{padding:'12px 16px', background:'#eef4ff', color:'#6b7280', fontWeight:700, letterSpacing:'.02em'}}>OFFSPRING</div>
 {livestockHistoryRows(selectedOffspringRecord || selectedLivestockRecord).offspring.map(([label, value], idx) => {
 const action = value === 'add-lamb'
 return <div key={`offspring-${label}-${idx}`} className='list-row' style={{padding:'14px 16px', borderBottom:'1px solid #eef2f7', alignItems:'center', cursor: action ? 'pointer' : 'default'}} onClick={() => {
 if (!action) return
 const parent = selectedOffspringRecord || selectedLivestockRecord
 const draft = buildOffspringDraftFromParent(parent)
 if (draft) setLivestockRecordForm(draft)
 setRecordsSectionOpen(prev => ({ ...prev, create: true, edit: false, details: false }))
 }}>
 <span style={{color:'#111827', fontWeight:600}}>{label} {String(value).startsWith('(') ? value : ''}</span>
 <strong style={{marginLeft:'auto', color:'#9ca3af', textAlign:'right'}}>{String(value).startsWith('(') ? '›' : value}</strong>
 </div>
 })}
 <div style={{padding:'12px 16px', background:'#eef4ff', color:'#6b7280', fontWeight:700, letterSpacing:'.02em'}}>MARKS</div>
 {livestockHistoryRows(selectedLivestockRecord).marks.map(([label, value], idx) => <div key={`marks-${label}-${idx}`} className='list-row' style={{padding:'14px 16px', borderBottom:'1px solid #eef2f7', alignItems:'center', cursor:'pointer'}} onClick={() => { if (value === 'add-mark') { const base=(selectedOffspringRecord || selectedLivestockRecord); setMarkDraft({ sire: base?.sire_id || '', dam: base?.dam_id || base?.id || '', markDate: new Date().toISOString().slice(0,10), dueDate: '2026-08-26', fertilizationType: 'Natural' }); setMarkComposerOpen(true) } if (value === 'add-flush') { const base=(selectedOffspringRecord || selectedLivestockRecord); setFlushDraft({ ram: base?.sire_id || '', date: new Date().toISOString().slice(0,10), cidrIn: '', cidrOut: '', notes: '' }); setFlushComposerOpen(true) } if (value === 'add-ultrasound') { setUltrasoundDraft({ date: new Date().toISOString().slice(0,10), result: '', notes: '' }); setUltrasoundComposerOpen(true) } }}><span style={{color:'#111827', fontWeight:600}}>{label}</span><strong style={{marginLeft:'auto', color:'#9ca3af', textAlign:'right'}}>›</strong></div>)}
 <div style={{padding:'12px 16px', background:'#eef4ff', color:'#6b7280', fontWeight:700, letterSpacing:'.02em'}}>PHOTOS & DOCS</div>
 <input ref={animalPhotoInputRef} type='file' accept='image/*' capture='environment' multiple style={{display:'none'}} onChange={(e) => handleAnimalPhotoFiles(e.target.files)} />
 <input ref={animalDocInputRef} type='file' accept='.pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,application/pdf,text/plain' multiple style={{display:'none'}} onChange={(e) => handleAnimalDocFiles(e.target.files)} />
 {livestockHistoryRows(selectedLivestockRecord).photosDocs.map(([label, value], idx) => <div key={`photosdocs-${label}-${idx}`} className='list-row' style={{padding:'14px 16px', borderBottom:'1px solid #eef2f7', alignItems:'center', cursor:'pointer'}} onClick={() => { if (value === 'add-photo') animalPhotoInputRef.current?.click(); if (value === 'add-doc') animalDocInputRef.current?.click() }}><span style={{color:'#111827', fontWeight:600}}>{label}</span><strong style={{marginLeft:'auto', color:'#9ca3af', textAlign:'right'}}>›</strong></div>)}
 {(animalUploads.photos || []).map((file, idx) => <div key={`animal-photo-${idx}`} className='list-row' style={{padding:'10px 16px', borderBottom:'1px solid #eef2f7'}}><span>📷 {file.name}</span><strong style={{marginLeft:'auto', color:'#94a3b8'}}>{Math.round((file.size||0)/1024)} KB</strong></div>)}
 {(animalUploads.docs || []).map((file, idx) => <div key={`animal-doc-${idx}`} className='list-row' style={{padding:'10px 16px', borderBottom:'1px solid #eef2f7'}}><span>📄 {file.name}</span><strong style={{marginLeft:'auto', color:'#94a3b8'}}>{Math.round((file.size||0)/1024)} KB</strong></div>)}
 <div style={{padding:'12px 16px', background:'#eef4ff', color:'#6b7280', fontWeight:700, letterSpacing:'.02em'}}>HERD</div>
 {livestockHistoryRows(selectedLivestockRecord).herd.map(([label, value], idx) => <div key={`herd-${label}-${idx}`} className='list-row' style={{padding:'14px 16px', borderBottom:'1px solid #eef2f7', alignItems:'center', cursor:'pointer'}} onClick={() => { if (value === 'move-herd') { setMoveHerdDraft({ herd: '', notes: '' }); setMoveHerdOpen(true) } }}><span style={{color:'#111827', fontWeight:600}}>{label}</span><strong style={{marginLeft:'auto', color:'#9ca3af', textAlign:'right'}}>›</strong></div>)}
 </div>}
 </article>}



 {breederReportOpen && selectedBreederDetail && <article className='panel' style={{padding:0, overflow:'auto', position:'fixed', inset:'0', zIndex:9999, maxWidth:560, margin:'0 auto', left:0, right:0, background:'#fff', boxShadow:'0 20px 60px rgba(15,23,42,.28)', borderRadius:0}}>
 <div style={{background:'#0f172a', color:'#fff', padding:'14px 16px', display:'flex', alignItems:'center', gap:12}}>
 <button type='button' className='btn' style={{background:'transparent', color:'#fff', border:'none', padding:0}} onClick={() => setBreederReportOpen(false)}>‹</button>
 <div>
 <div style={{fontSize:'1.05rem', fontWeight:700}}>Breeder Performance Report</div>
 <div style={{fontSize:'.82rem', opacity:.85}}>FarmSavior report for {selectedBreederDetail.name}</div>
 </div>
 <button type='button' className='btn' style={{marginLeft:'auto', background:'#fff', color:'#0f172a', border:'none'}}>Share PDF</button>
 </div>
 <div style={{padding:16, background:'#fff'}}>
 <div className='row2' style={{gap:12}}>
 <div className='panel' style={{padding:12, borderRadius:14, background:'#f8fafc'}}><div className='helper-text'>Breeder</div><strong>{selectedBreederDetail.name}</strong></div>
 <div className='panel' style={{padding:12, borderRadius:14, background:'#f8fafc'}}><div className='helper-text'>Species focus</div><strong>{selectedLivestockRecord?.species || 'Sheep'}</strong></div>
 </div>
 <div className='row2' style={{gap:12, marginTop:12}}>
 <div className='panel' style={{padding:12, borderRadius:14, background:'#ecfeff', border:'1px solid #a5f3fc'}}><div className='helper-text'>Animals recorded</div><strong>7</strong></div>
 <div className='panel' style={{padding:12, borderRadius:14, background:'#f0fdf4', border:'1px solid #86efac'}}><div className='helper-text'>Average stars</div><strong>4.2 / 5</strong></div>
 </div>
 <article className='panel' style={{marginTop:12, padding:0, overflow:'hidden', borderRadius:16}}>
 <div style={{padding:'12px 14px', borderBottom:'1px solid #e5e7eb', fontWeight:700}}>Breeder animals summary</div>
 <div className='list-row' style={{padding:'12px 14px', fontWeight:700, background:'#f8fafc'}}><span>Name / Tag #</span><span>Sire</span><span>Dam</span><span>Birth Date</span><span>Sex</span><span>Breed</span><span>Stars</span></div>
 {[
 [selectedLivestockRecord?.name || '0001', selectedLivestockRecord?.sire_id || '--', selectedLivestockRecord?.dam_id || '--', selectedLivestockRecord?.date_of_birth ? String((selectedOffspringRecord || selectedLivestockRecord).date_of_birth).slice(0,10) : '--', selectedLivestockRecord?.animal_type || '--', selectedLivestockRecord?.breeding_type || '--', selectedLivestockRecord?.stars ?? '--'],
 ['0005','--','--','--','F','Baloji','4'],
 ['0007Y','--','--','--','F','Baloji','4'],
 ['0020 old 06','--','--','--','F','Baloji','3'],
 ['0112','--','--','--','M','Balami','5'],
 ].map((row, idx) => <div key={`breeder-report-row-${idx}`} className='list-row' style={{padding:'12px 14px', borderTop:'1px solid #eef2f7', display:'grid', gridTemplateColumns:'1.5fr 1fr 1fr 1fr .7fr 1fr .7fr', gap:8}}>{row.map((cell, cidx) => <span key={`cell-${idx}-${cidx}`} style={{color:'#111827'}}>{cell}</span>)}</div>)}
 </article>
 <article className='panel' style={{marginTop:12, padding:12, borderRadius:16, background:'#fff7ed', border:'1px solid #fdba74'}}>
 <div style={{fontWeight:700, marginBottom:6}}>FarmSavior summary</div>
 <div style={{fontSize:'.92rem', color:'#475569'}}>This breeder report is designed to be cleaner and more useful than a raw export. It highlights breeder quality, recorded offspring, and quick lineage review in a mobile-friendly layout.</div>
 </article>
 </div>
 </article>}













 {markComposerOpen && (selectedOffspringRecord || selectedLivestockRecord) && <article className='panel' style={{padding:0, overflow:'auto', position:'fixed', inset:'0', zIndex:9999, maxWidth:560, margin:'0 auto', left:0, right:0, background:'#fff', boxShadow:'0 20px 60px rgba(15,23,42,.28)', borderRadius:0}}>
 <div style={{background:'#1d4ed8', color:'#fff', padding:'12px 14px', display:'flex', alignItems:'center', gap:12}}>
 <button type='button' className='btn' style={{background:'transparent', color:'#fff', border:'none', padding:0}} onClick={() => setMarkComposerOpen(false)}>Cancel</button>
 <strong style={{margin:'0 auto'}}>{`Mark : ${String((selectedOffspringRecord || selectedLivestockRecord)?.id || '0001').padStart(4,'0')} : ${new Date(markDraft.markDate || Date.now()).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}`}</strong>
 <button type='button' className='btn' style={{background:'transparent', color:'#fff', border:'none', padding:0}} onClick={() => setMarkComposerOpen(false)}>Done</button>
 </div>
 <div style={{background:'#eef2f7', minHeight:360}}>
 <div style={{background:'#fff', padding:'14px 16px', borderBottom:'1px solid #e5e7eb', display:'grid', gridTemplateColumns:'90px 1fr auto', alignItems:'center', gap:12}}>
 <span style={{color:'#1e3a8a', fontWeight:700}}>Sire</span>
 <span style={{color: markDraft.sire ? '#111827' : '#9ca3af'}}>{markDraft.sire || 'Choose'}</span>
 <span style={{color:'#9ca3af'}}>›</span>
 </div>
 <div style={{background:'#fff', padding:'14px 16px', borderBottom:'1px solid #e5e7eb', display:'grid', gridTemplateColumns:'90px 1fr auto', alignItems:'center', gap:12}}>
 <span style={{color:'#1e3a8a', fontWeight:700}}>Dam</span>
 <span style={{color:'#111827'}}>{markDraft.dam || '0001'}</span>
 <span style={{color:'#9ca3af'}}>›</span>
 </div>
 <div style={{background:'#fff', padding:'14px 16px', borderBottom:'1px solid #e5e7eb', display:'grid', gridTemplateColumns:'90px 1fr', alignItems:'center', gap:12}}>
 <span style={{color:'#1e3a8a', fontWeight:700}}>Mark Date</span>
 <strong>{new Date(markDraft.markDate || Date.now()).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}</strong>
 </div>
 <div style={{background:'#fff', padding:'14px 16px', borderBottom:'1px solid #e5e7eb', display:'grid', gridTemplateColumns:'90px 1fr', alignItems:'center', gap:12}}>
 <span style={{color:'#1e3a8a', fontWeight:700}}>Due Date</span>
 <strong>{new Date(markDraft.dueDate || Date.now()).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}</strong>
 </div>
 <div style={{padding:'14px 16px', color:'#6b7280', fontWeight:700}}>FERTILIZATION TYPE</div>
 <div style={{padding:'0 12px 18px'}}>
 <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8, background:'#e5e7eb', borderRadius:12, padding:4}}>
 {['Natural','AI Fresh','AI Frozen'].map(opt => <button key={`fert-${opt}`} type='button' className='btn' style={{background: markDraft.fertilizationType===opt ? '#fff' : 'transparent', border:'none', boxShadow:'none', fontWeight:700}} onClick={() => setMarkDraft(prev => ({ ...prev, fertilizationType: opt }))}>{opt}</button>)}
 </div>
 </div>
 </div>
 </article>}

 {offspringListOpen && (selectedOffspringRecord || selectedLivestockRecord) && <article className='panel' style={{padding:0, overflow:'auto', position:'fixed', inset:'0', zIndex:9999, maxWidth:560, margin:'0 auto', left:0, right:0, background:'#fff', boxShadow:'0 20px 60px rgba(15,23,42,.28)', borderRadius:0}}>
 <div style={{background:'#1d4ed8', color:'#fff', padding:'12px 14px', display:'flex', alignItems:'center', gap:12}}>
 <button type='button' className='btn' style={{background:'transparent', color:'#fff', border:'none', padding:0}} onClick={() => setOffspringListOpen(false)}>‹</button>
 <strong>{String((selectedOffspringRecord || selectedLivestockRecord).id || '0001').padStart(4,'0')}</strong>
 <div style={{fontWeight:700}}>Offspring</div>
 <button type='button' className='btn' style={{marginLeft:'auto', background:'transparent', color:'#fff', border:'none', fontSize:'1.4rem'}}>+</button>
 </div>
 <div style={{padding:12, background:'#1d4ed8'}}>
 <input className='input' placeholder='Search' value={offspringSearch} onChange={(e) => setOffspringSearch(e.target.value)} style={{background:'#1e3a8a', color:'#fff', border:'none', borderRadius:12}} />
 </div>
 <div style={{background:'#fff', minHeight:320}}>
 {[
 {date:'2023-02-08', id:'0040', breeder:'Sheep Ghana'},
 {date:'2023-09-27', id:'0185', breeder:'Sheep Ghana'},
 {date:'2024-04-13', id:'0019g', breeder:'Sheep Ghana'},
 ].filter(item => !offspringSearch || `${item.date} ${item.id} ${item.breeder}`.toLowerCase().includes(offspringSearch.toLowerCase())).map((item, idx) => <div key={`offspring-list-${idx}`} style={{borderTop:'1px solid #eef2f7', cursor:'pointer'}} onClick={() => {
 setSelectedOffspringRecord({
 id: item.id,
 name: item.id,
 species: (selectedLivestockRecord?.species || 'SHEEP'),
 animal_type: idx === 0 ? 'Ewe' : (idx === 1 ? 'W' : 'Ewe'),
 purchased_from: item.breeder,
 breeding_type: idx === 2 ? 'Boboji' : ((selectedLivestockRecord?.breeding_type) || 'Boboji'),
 date_of_birth: item.date,
 sold_to: idx === 0 ? 'Myroc' : '--',
 sale_date: idx === 0 ? '2024-02-27' : '',
 sire_id: '--',
 dam_id: '0001',
 farm_id: '--',
 litter_size: 1,
 registration_number: '--',
 notes: '--',
 health_status: 'Natural',
 cull_keep_status: '',
 })
 setRecordsSectionOpen(prev => ({ ...prev, details: true }))
 }}>
 <div style={{padding:'16px 16px 8px', color:'#6b7280', fontWeight:700}}>{new Date(item.date).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }).toUpperCase()}</div>
 <div className='list-row' style={{padding:'0 16px 14px', alignItems:'center'}}><div><div style={{fontWeight:700, color:'#111827'}}>{item.id}</div><div style={{fontSize:'.9rem', color:'#111827'}}>{item.breeder}</div></div><strong style={{marginLeft:'auto', color:'#9ca3af'}}>›</strong></div>
 </div>)}
 </div>
 </article>}

 {offspringReportOpen && (selectedOffspringRecord || selectedLivestockRecord) && <article className='panel' style={{padding:0, overflow:'auto', position:'fixed', inset:'0', zIndex:9999, maxWidth:560, margin:'0 auto', left:0, right:0, background:'#fff', borderRadius:0}}>
 <div style={{background:'#0f172a', color:'#fff', padding:'14px 16px', display:'flex', alignItems:'center', gap:12}}>
 <button type='button' className='btn' style={{background:'transparent', color:'#fff', border:'none', padding:0}} onClick={() => setOffspringReportOpen(false)}>‹</button>
 <div>
 <div style={{fontSize:'1.05rem', fontWeight:700}}>FarmSavior Offspring Report</div>
 <div style={{fontSize:'.82rem', opacity:.85}}>Offspring summary for {String((selectedOffspringRecord || selectedLivestockRecord).id || '0001').padStart(4,'0')}</div>
 </div>
 <button type='button' className='btn' style={{marginLeft:'auto', background:'#fff', color:'#0f172a', border:'none'}} onClick={() => window.print()}>Print / Save PDF</button>
 </div>
 <div style={{background:'#fff', padding:16}}>
 <div className='row2' style={{gap:12}}>
 <div className='panel' style={{padding:12, borderRadius:14, background:'#eff6ff', border:'1px solid #bfdbfe'}}><div className='helper-text'>Parent animal</div><strong>{String((selectedOffspringRecord || selectedLivestockRecord).id || '0001').padStart(4,'0')}</strong></div>
 <div className='panel' style={{padding:12, borderRadius:14, background:'#f8fafc', border:'1px solid #e5e7eb'}}><div className='helper-text'>Recorded offspring</div><strong>{Number((selectedOffspringRecord || selectedLivestockRecord).litter_size || 0)}</strong></div>
 </div>
 <article className='panel' style={{marginTop:12, padding:0, overflow:'hidden', borderRadius:16}}>
 <div style={{padding:'12px 14px', borderBottom:'1px solid #e5e7eb', fontWeight:700}}>Offspring table</div>
 <div className='list-row' style={{padding:'12px 14px', fontWeight:700, background:'#f8fafc', display:'grid', gridTemplateColumns:'1.2fr 1fr 1fr .8fr 1fr 1fr 1fr 1fr', gap:8}}><span>Name / Tag #</span><span>Birth Date</span><span>Sire</span><span>Sex</span><span>Buyer</span><span>Sale Price</span><span>Sale Desc</span><span>Winnings</span></div>
 {[
 [(selectedOffspringRecord || selectedLivestockRecord).name || '00199', (selectedOffspringRecord || selectedLivestockRecord).date_of_birth ? String((selectedOffspringRecord || selectedLivestockRecord).date_of_birth).slice(0,10) : '--', (selectedOffspringRecord || selectedLivestockRecord).sire_id || '--', (selectedOffspringRecord || selectedLivestockRecord).animal_type || '--', (selectedOffspringRecord || selectedLivestockRecord).sold_to || '--', (selectedOffspringRecord || selectedLivestockRecord).sale_price || '--', (selectedOffspringRecord || selectedLivestockRecord).pen_location || '--', (selectedOffspringRecord || selectedLivestockRecord).treatment_entry || '--'],
 ['0185','2023-09-27','--','W','--','$0','--','--'],
 ['0040','2020-02-05','--','Ewe','--','$0','--','--'],
 ].map((row, idx) => <div key={`offspring-report-row-${idx}`} className='list-row' style={{padding:'12px 14px', borderTop:'1px solid #eef2f7', display:'grid', gridTemplateColumns:'1.2fr 1fr 1fr .8fr 1fr 1fr 1fr 1fr', gap:8}}>{row.map((cell, cidx) => <span key={`offspring-cell-${idx}-${cidx}`} style={{color:'#111827'}}>{cell}</span>)}</div>)}
 </article>
 <div className='row2' style={{gap:12, marginTop:12}}>
 <div className='panel' style={{padding:12, borderRadius:14, background:'#f0fdf4', border:'1px solid #86efac'}}><div className='helper-text'>Total animals sold</div><strong>0</strong></div>
 <div className='panel' style={{padding:12, borderRadius:14, background:'#fff7ed', border:'1px solid #fdba74'}}><div className='helper-text'>Average offspring sold</div><strong>0</strong></div>
 </div>
 <div style={{marginTop:18, fontSize:'.8rem', color:'#94a3b8'}}>FarmSavior • Generated offspring report</div>
 </div>
 </article>}

 {ancestorPdfOpen && (selectedOffspringRecord || selectedLivestockRecord) && <article className='panel' style={{padding:0, overflow:'auto', position:'fixed', inset:'0', zIndex:9999, maxWidth:560, margin:'0 auto', left:0, right:0, background:'#fff', borderRadius:0}}>
 <div style={{background:'#0f172a', color:'#fff', padding:'14px 16px', display:'flex', alignItems:'center', gap:12}}>
 <button type='button' className='btn' style={{background:'transparent', color:'#fff', border:'none', padding:0}} onClick={() => setAncestorPdfOpen(false)}>‹</button>
 <div>
 <div style={{fontSize:'1.05rem', fontWeight:700}}>FarmSavior Animal Lineage Report</div>
 <div style={{fontSize:'.82rem', opacity:.85}}>Printable pedigree report</div>
 </div>
 <button type='button' className='btn' style={{marginLeft:'auto', background:'#fff', color:'#0f172a', border:'none'}} onClick={() => window.print()}>Print / Save PDF</button>
 </div>
 <div style={{background:'#fff', padding:16}}>
 <div className='row2' style={{gap:12}}>
 <div className='panel' style={{padding:12, borderRadius:14, background:'#eff6ff', border:'1px solid #bfdbfe'}}>
 <div className='helper-text'>Animal ID</div><strong>{String((selectedOffspringRecord || selectedLivestockRecord).id || '0001').padStart(4,'0')}</strong>
 </div>
 <div className='panel' style={{padding:12, borderRadius:14, background:'#f8fafc', border:'1px solid #e5e7eb'}}>
 <div className='helper-text'>Species / Sex</div><strong>{(selectedOffspringRecord || selectedLivestockRecord).species || '--'} • {(selectedOffspringRecord || selectedLivestockRecord).animal_type || '--'}</strong>
 </div>
 </div>
 <div className='row2' style={{gap:12, marginTop:12}}>
 <div className='panel' style={{padding:12, borderRadius:14, background:'#f0fdf4', border:'1px solid #86efac'}}><div className='helper-text'>Breed</div><strong>{(selectedOffspringRecord || selectedLivestockRecord).breeding_type || '--'}</strong></div>
 <div className='panel' style={{padding:12, borderRadius:14, background:'#fff7ed', border:'1px solid #fdba74'}}><div className='helper-text'>Breeder</div><strong>{(selectedOffspringRecord || selectedLivestockRecord).purchased_from || '--'}</strong></div>
 </div>
 <article className='panel' style={{marginTop:12, padding:16, borderRadius:16}}>
 <div style={{fontWeight:700, marginBottom:12}}>Pedigree Overview</div>
 <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
 <div style={{padding:12, border:'1px solid #e5e7eb', borderRadius:12}}><div className='helper-text'>Sire</div><strong>{(selectedOffspringRecord || selectedLivestockRecord).sire_id || 'Not chosen'}</strong></div>
 <div style={{padding:12, border:'1px solid #e5e7eb', borderRadius:12}}><div className='helper-text'>Dam</div><strong>{(selectedOffspringRecord || selectedLivestockRecord).dam_id || 'Not chosen'}</strong></div>
 <div style={{padding:12, border:'1px solid #e5e7eb', borderRadius:12}}><div className='helper-text'>Dam-Sire</div><strong>{(selectedOffspringRecord || selectedLivestockRecord).farm_id || 'Not chosen'}</strong></div>
 <div style={{padding:12, border:'1px solid #e5e7eb', borderRadius:12}}><div className='helper-text'>DNA</div><strong>{(selectedOffspringRecord || selectedLivestockRecord).registration_number || 'Not tested'}</strong></div>
 </div>
 </article>
 <article className='panel' style={{marginTop:12, padding:16, borderRadius:16}}>
 <div style={{fontWeight:700, marginBottom:12}}>FarmSavior Summary</div>
 <div style={{fontSize:'.94rem', color:'#475569', lineHeight:1.6}}>This report is designed to be clearer and more useful than a raw export. It gives farmers a cleaner lineage record, animal identity snapshot, and breeder context in a format that works for mobile viewing, printing, and PDF sharing.</div>
 </article>
 <div style={{marginTop:18, fontSize:'.8rem', color:'#94a3b8'}}>FarmSavior • Generated lineage report</div>
 </div>
 </article>}

 {ancestorTreeOpen && (selectedOffspringRecord || selectedLivestockRecord) && <article className='panel' style={{padding:0, overflow:'auto', position:'fixed', inset:'0', zIndex:9999, maxWidth:560, margin:'0 auto', left:0, right:0, background:'#fff', boxShadow:'0 20px 60px rgba(15,23,42,.28)', borderRadius:0}}>
 <div style={{background:'#1d4ed8', color:'#fff', padding:'12px 14px', display:'flex', alignItems:'center', gap:12}}>
 <button type='button' className='btn' style={{background:'transparent', color:'#fff', border:'none', padding:0}} onClick={() => setAncestorTreeOpen(false)}>‹</button>
 <strong>{String((selectedOffspringRecord || selectedLivestockRecord).id || '0001').padStart(4,'0')}</strong>
 <div style={{fontWeight:700}}>{String((selectedOffspringRecord || selectedLivestockRecord).id || '0001').padStart(4,'0')}</div>
 <button type='button' className='btn' style={{marginLeft:'auto', background:'transparent', color:'#fff', border:'none'}} onClick={() => setAncestorPdfOpen(true)}>Share PDF</button>
 </div>
 <div style={{background:'#6b7280', height:140}} />
 <div style={{background:'#f8fafc', minHeight:520, position:'relative', overflow:'hidden', backgroundImage:'linear-gradient(#e5e7eb 1px, transparent 1px), linear-gradient(90deg, #e5e7eb 1px, transparent 1px)', backgroundSize:'16px 16px'}}>
 <div style={{position:'absolute', left:24, top:40, width:84, minHeight:90, background:'#fff', border:'2px solid #111827', borderRadius:8, display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', fontWeight:700}}>
 <div>{String((selectedOffspringRecord || selectedLivestockRecord).id || '0001').padStart(4,'0')}</div>
 <div style={{fontSize:'1.1rem'}}>{String((selectedOffspringRecord || selectedLivestockRecord).animal_type || 'Ewe').replaceAll('_',' ')}</div>
 </div>
 <div style={{position:'absolute', left:38, top:178, width:68, minHeight:44, background:'#fff', border:'2px solid #f0abfc', borderRadius:8, display:'flex', justifyContent:'center', alignItems:'center', fontWeight:700}}>{String((selectedOffspringRecord || selectedLivestockRecord).id || '0001').padStart(4,'0')}</div>
 <div style={{position:'absolute', left:105, top:197, width:56, height:2, background:'#6b7280'}} />
 <div style={{position:'absolute', left:160, top:105, width:2, height:110, background:'#6b7280'}} />
 <div style={{position:'absolute', left:160, top:105, width:40, height:2, background:'#6b7280'}} />
 <div style={{position:'absolute', left:160, top:215, width:40, height:2, background:'#6b7280'}} />
 <div style={{position:'absolute', left:198, top:86, padding:'8px 16px', background:'#fff', border:'1px solid #d1d5db', borderRadius:10, color:'#9ca3af', fontSize:'1.1rem'}}>{(selectedOffspringRecord || selectedLivestockRecord).sire_id ? `Sire ${(selectedOffspringRecord || selectedLivestockRecord).sire_id}` : 'Sire Not Chosen'}</div>
 <div style={{position:'absolute', left:198, top:196, padding:'8px 16px', background:'#fff', border:'1px solid #d1d5db', borderRadius:10, color:'#9ca3af', fontSize:'1.1rem'}}>{(selectedOffspringRecord || selectedLivestockRecord).dam_id ? `Dam ${(selectedOffspringRecord || selectedLivestockRecord).dam_id}` : 'Dam Not Chosen'}</div>
 <div style={{position:'absolute', left:20, bottom:18, color:'#cbd5e1', fontWeight:700, opacity:.8}}>FarmSavior</div>
 </div>
 </article>}

 {famachaComposerOpen && (selectedOffspringRecord || selectedLivestockRecord) && <article className='panel' style={{padding:0, overflow:'auto', position:'fixed', inset:'0', zIndex:9999, maxWidth:560, margin:'0 auto', left:0, right:0, background:'#fff', boxShadow:'0 20px 60px rgba(15,23,42,.28)', borderRadius:0}}>
 <div style={{background:'#1d4ed8', color:'#fff', padding:'12px 14px', display:'flex', alignItems:'center', gap:12}}>
 <button type='button' className='btn' style={{background:'transparent', color:'#fff', border:'none', padding:0}} onClick={() => setFamachaComposerOpen(false)}>Cancel</button>
 <strong style={{margin:'0 auto'}}>FAMACHA / BCS</strong>
 <button type='button' className='btn' style={{background:'transparent', color:'#fff', border:'none', padding:0}} onClick={() => setFamachaComposerOpen(false)}>Done</button>
 </div>
 <div style={{background:'#eef2f7', minHeight:420}}>
 <div style={{padding:'14px 16px', color:'#6b7280', fontWeight:700}}>FAMACHA SCORE</div>
 <div style={{background:'#fff', padding:'10px 16px', borderBottom:'1px solid #e5e7eb'}}>
 <div style={{display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap:8}}>
 {['--','1','2','3','4','5'].map(score => <button key={`famacha-${score}`} type='button' className={`btn ${famachaDraft.famacha===score ? 'btn-dark' : ''}`} onClick={() => setFamachaDraft(prev => ({ ...prev, famacha: score }))}>{score}</button>)}
 </div>
 </div>
 <div style={{padding:'14px 16px', color:'#6b7280', fontWeight:700}}>BODY CONDITION SCORE</div>
 <div style={{background:'#fff', padding:'14px 16px', borderBottom:'1px solid #e5e7eb'}}>
 <label style={{display:'grid', gridTemplateColumns:'140px 1fr', alignItems:'center', gap:12}}>
 <span style={{color:'#1e3a8a', fontWeight:700}}>Body Score</span>
 <input className='input' placeholder='Score' value={famachaDraft.bodyScore} onChange={(e) => setFamachaDraft(prev => ({ ...prev, bodyScore: e.target.value }))} style={{border:'none', boxShadow:'none', padding:'4px 0'}} />
 </label>
 </div>
 <div style={{padding:'14px 16px', color:'#6b7280', fontWeight:700}}>WEIGHT</div>
 <div style={{background:'#fff', padding:'14px 16px', borderBottom:'1px solid #e5e7eb'}}>
 <label style={{display:'grid', gridTemplateColumns:'140px 1fr', alignItems:'center', gap:12}}>
 <span style={{color:'#1e3a8a', fontWeight:700}}>Weight</span>
 <input className='input' placeholder='Weight' value={famachaDraft.weight} onChange={(e) => setFamachaDraft(prev => ({ ...prev, weight: e.target.value }))} style={{border:'none', boxShadow:'none', padding:'4px 0'}} />
 </label>
 </div>
 <div style={{background:'#fff', padding:'14px 16px', borderBottom:'1px solid #e5e7eb', display:'grid', gridTemplateColumns:'140px 1fr', alignItems:'center', gap:12}}>
 <span style={{color:'#1e3a8a', fontWeight:700}}>Score Date</span>
 <strong>{new Date().toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}</strong>
 </div>
 <div style={{padding:'14px 16px', color:'#6b7280', fontWeight:700}}>NOTES</div>
 <div style={{background:'#fff', minHeight:120, padding:'12px 16px'}}>
 <textarea className='input' rows={4} placeholder='Notes' value={famachaDraft.notes} onChange={(e) => setFamachaDraft(prev => ({ ...prev, notes: e.target.value }))} style={{width:'100%', border:'none', boxShadow:'none', padding:0}} />
 </div>
 </div>
 </article>}

 {customMedicineComposerOpen && (selectedOffspringRecord || selectedLivestockRecord) && <article className='panel' style={{padding:0, overflow:'auto', position:'fixed', inset:'0', zIndex:9999, maxWidth:560, margin:'0 auto', left:0, right:0, background:'#fff', borderRadius:0}}>
 <div style={{background:'#1d4ed8', color:'#fff', padding:'12px 14px', display:'flex', alignItems:'center', gap:12}}>
 <button type='button' className='btn' style={{background:'transparent', color:'#fff', border:'none', padding:0}} onClick={() => setCustomMedicineComposerOpen(false)}>Cancel</button>
 <strong style={{margin:'0 auto'}}>Medicines</strong>
 <button type='button' className='btn' style={{background:'transparent', color:'#fff', border:'none', padding:0}} onClick={() => {
 const cleaned = String(customMedicineName || '').trim()
 if (cleaned) setMedicineShotDraft(prev => ({ ...prev, medicine: cleaned }))
 setCustomMedicineComposerOpen(false)
 setMedicineChooserOpen(false)
 }}>Done</button>
 </div>
 <div style={{background:'#fff', minHeight:220, padding:'16px'}}>
 <input className='input' placeholder='Medicine name' value={customMedicineName} onChange={(e) => setCustomMedicineName(e.target.value)} />
 </div>
 </article>}

 {medicineChooserOpen && (selectedOffspringRecord || selectedLivestockRecord) && <article className='panel' style={{padding:0, overflow:'auto', position:'fixed', inset:'0', zIndex:9999, maxWidth:560, margin:'0 auto', left:0, right:0, background:'#fff', borderRadius:0}}>
 <div style={{background:'#1d4ed8', color:'#fff', padding:'12px 14px', display:'flex', alignItems:'center', gap:12}}>
 <button type='button' className='btn' style={{background:'transparent', color:'#fff', border:'none', padding:0}} onClick={() => setMedicineChooserOpen(false)}>Cancel</button>
 <strong style={{margin:'0 auto'}}>Medicines</strong>
 <button type='button' className='btn' style={{background:'transparent', color:'#fff', border:'none', fontSize:'1.4rem'}} onClick={() => { setCustomMedicineName(''); setCustomMedicineComposerOpen(true) }}>+</button>
 </div>
 <div style={{padding:12, background:'#1d4ed8'}}>
 <input className='input' placeholder='Search' value={medicineChooserSearch} onChange={(e) => setMedicineChooserSearch(e.target.value)} style={{background:'#1e3a8a', color:'#fff', border:'none', borderRadius:12}} />
 </div>
 <div style={{background:'#fff', minHeight:320}}>
 {(() => {
 const species = String((selectedOffspringRecord || selectedLivestockRecord).species || 'SHEEP').toUpperCase()
 const catalog = livestockMedicineOptions[species] || livestockMedicineOptions.SHEEP
 const match = (name) => !medicineChooserSearch || name.toLowerCase().includes(medicineChooserSearch.toLowerCase())
 return <>
 <div className='list-row' style={{padding:'18px 16px', borderBottom:'1px solid #eef2f7', alignItems:'center', cursor:'pointer'}} onClick={() => { setMedicineShotDraft(prev => ({ ...prev, medicine: '' })); setMedicineChooserOpen(false) }}><span style={{fontWeight:600}}>None</span></div>
 <div style={{padding:'12px 16px', background:'#eef2f7', color:'#6b7280', fontWeight:700}}>{species} MEDICINES</div>
 {catalog.species.filter(match).map((item, idx) => <div key={`med-species-${idx}`} className='list-row' style={{padding:'18px 16px', borderBottom:'1px solid #eef2f7', alignItems:'center', cursor:'pointer'}} onClick={() => { setMedicineShotDraft(prev => ({ ...prev, medicine: item })); setMedicineChooserOpen(false) }}><span style={{fontWeight:600, color:'#111827'}}>{item}</span></div>)}
 <div style={{padding:'12px 16px', background:'#eef2f7', color:'#6b7280', fontWeight:700}}>OTHER MEDICINES</div>
 {catalog.other.filter(match).map((item, idx) => <div key={`med-other-${idx}`} className='list-row' style={{padding:'18px 16px', borderBottom:'1px solid #eef2f7', alignItems:'center', cursor:'pointer'}} onClick={() => { setMedicineShotDraft(prev => ({ ...prev, medicine: item })); setMedicineChooserOpen(false) }}><span style={{fontWeight:600, color:'#111827'}}>{item}</span></div>)}
 </>
 })()}
 </div>
 </article>}

 {medicineShotOpen && (selectedOffspringRecord || selectedLivestockRecord) && <article className='panel' style={{padding:0, overflow:'auto', position:'fixed', inset:'0', zIndex:9999, maxWidth:560, margin:'0 auto', left:0, right:0, background:'#fff', borderRadius:0}}>
 <div style={{background:'#1d4ed8', color:'#fff', padding:'12px 14px', display:'flex', alignItems:'center', gap:12}}>
 <button type='button' className='btn' style={{background:'transparent', color:'#fff', border:'none', padding:0}} onClick={() => setMedicineShotOpen(false)}>Cancel</button>
 <strong style={{margin:'0 auto'}}>Medicine Shot</strong>
 <button type='button' className='btn' style={{background:'transparent', color:'#fff', border:'none', padding:0}} onClick={() => setMedicineShotOpen(false)}>Done</button>
 </div>
 <div style={{background:'#eef2f7', minHeight:360}}>
 <div style={{background:'#fff', borderBottom:'1px solid #e5e7eb', padding:'14px 16px', display:'grid', gridTemplateColumns:'100px 1fr auto', alignItems:'center', gap:12}}>
 <span style={{color:'#1e3a8a', fontWeight:700}}>Medicine</span>
 <span style={{color: medicineShotDraft.medicine ? '#111827' : '#9ca3af'}} onClick={() => { setMedicineChooserSearch(''); setMedicineChooserOpen(true) }}>{medicineShotDraft.medicine || 'Choose'}</span>
 <span style={{color:'#9ca3af', cursor:'pointer'}} onClick={() => { setMedicineChooserSearch(''); setMedicineChooserOpen(true) }}>›</span>
 </div>
 <div style={{background:'#fff', borderBottom:'1px solid #e5e7eb', padding:'14px 16px', display:'grid', gridTemplateColumns:'100px 1fr', alignItems:'center', gap:12}}>
 <span style={{color:'#1e3a8a', fontWeight:700}}>Date</span>
 <strong>{new Date().toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}</strong>
 </div>
 <div style={{background:'#fff', borderBottom:'1px solid #e5e7eb', padding:'14px 16px', display:'grid', gridTemplateColumns:'100px 1fr', alignItems:'center', gap:12}}>
 <span style={{color:'#1e3a8a', fontWeight:700}}>Dosage</span>
 <input className='input' placeholder='Dosage' value={medicineShotDraft.dosage} onChange={(e) => setMedicineShotDraft(prev => ({ ...prev, dosage: e.target.value }))} style={{border:'none', boxShadow:'none', padding:'4px 0'}} />
 </div>
 <div style={{padding:'12px 16px', color:'#6b7280', fontWeight:700}}>NOTES</div>
 <div style={{background:'#fff', minHeight:120, padding:'12px 16px'}}>
 <textarea className='input' rows={4} placeholder='Notes' value={medicineShotDraft.notes} onChange={(e) => setMedicineShotDraft(prev => ({ ...prev, notes: e.target.value }))} style={{width:'100%', border:'none', boxShadow:'none', padding:0}} />
 </div>
 </div>
 </article>}

 {medicinesScreenOpen && (selectedOffspringRecord || selectedLivestockRecord) && <article className='panel' style={{padding:0, overflow:'auto', position:'fixed', inset:'0', zIndex:9999, maxWidth:560, margin:'0 auto', left:0, right:0, background:'#fff', borderRadius:0}}>
 <div style={{background:'#1d4ed8', color:'#fff', padding:'12px 14px', display:'flex', alignItems:'center', gap:12}}>
 <button type='button' className='btn' style={{background:'transparent', color:'#fff', border:'none', padding:0}} onClick={() => setMedicinesScreenOpen(false)}>‹</button>
 <strong>{String((selectedOffspringRecord || selectedLivestockRecord).id || '0001').padStart(4,'0')}</strong>
 <div style={{fontWeight:700}}>{String((selectedOffspringRecord || selectedLivestockRecord).id || '0001').padStart(4,'0')}</div>
 <button type='button' className='btn' style={{marginLeft:'auto', background:'transparent', color:'#fff', border:'none', fontSize:'1.4rem'}} onClick={() => { setMedicineShotDraft({ medicine: '', dosage: '', notes: '' }); setMedicineShotOpen(true) }}>+</button>
 </div>
 <div style={{padding:12, background:'#f8fafc'}}>
 <input className='input' placeholder='Search' value={medicinesSearch} onChange={(e) => setMedicinesSearch(e.target.value)} style={{background:'#1e3a8a', color:'#fff', border:'none', borderRadius:12}} />
 </div>
 <div style={{background:'#fff', minHeight:320}}>
 {[
 {name: 'Tsetsefly Shot', date: '2023-09-13'},
 {name: 'PPR vax', date: '2023-03-01'},
 ].filter(item => !medicinesSearch || `${item.name} ${item.date}`.toLowerCase().includes(medicinesSearch.toLowerCase())).map((item, idx) => <div key={`medicine-row-${idx}`} className='list-row' style={{padding:'18px 16px', borderBottom:'1px solid #eef2f7', alignItems:'center'}}><span style={{fontWeight:600, color:'#111827'}}>{item.name}</span><strong style={{marginLeft:'auto', color:'#111827'}}>{new Date(item.date).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}</strong><span style={{marginLeft:10, color:'#9ca3af'}}>›</span></div>)}
 </div>
 </article>}

 {weightComposerOpen && (selectedOffspringRecord || selectedLivestockRecord) && <article className='panel' style={{padding:0, overflow:'auto', position:'fixed', inset:'0', zIndex:9999, maxWidth:560, margin:'0 auto', left:0, right:0, background:'#fff', borderRadius:0}}>
 <div style={{background:'#1d4ed8', color:'#fff', padding:'12px 14px', display:'flex', alignItems:'center', gap:12}}>
 <button type='button' className='btn' style={{background:'transparent', color:'#fff', border:'none', padding:0}} onClick={() => setWeightComposerOpen(false)}>Cancel</button>
 <strong style={{margin:'0 auto'}}>Weight</strong>
 <button type='button' className='btn' style={{background:'transparent', color:'#fff', border:'none', padding:0}} onClick={() => {
 if (String(draftWeight || '').trim()) setSelectedLivestockRecord(prev => prev ? ({ ...prev, initial_weight_kg: draftWeight }) : prev)
 setWeightComposerOpen(false)
 }}>Done</button>
 </div>
 <div style={{background:'#eef2f7', minHeight:380}}>
 <div style={{background:'#fff', padding:'14px 16px', borderBottom:'1px solid #e5e7eb'}}>
 <label style={{display:'grid', gridTemplateColumns:'90px 1fr', alignItems:'center', gap:12}}>
 <span style={{color:'#1e3a8a', fontWeight:700}}>Weight</span>
 <input className='input' placeholder='Weight' value={draftWeight} onChange={(e) => setDraftWeight(e.target.value)} style={{border:'none', boxShadow:'none', padding:'4px 0'}} />
 </label>
 </div>
 <div style={{background:'#fff', padding:'14px 16px', borderBottom:'1px solid #e5e7eb'}}>
 <div style={{display:'grid', gridTemplateColumns:'90px 1fr', alignItems:'center', gap:12}}>
 <span style={{color:'#1e3a8a', fontWeight:700}}>Date</span>
 <strong>{new Date().toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}</strong>
 </div>
 </div>
 </div>
 </article>}

 {notesComposerOpen && (selectedOffspringRecord || selectedLivestockRecord) && <article className='panel' style={{padding:0, overflow:'auto', position:'fixed', inset:'0', zIndex:9999, maxWidth:560, margin:'0 auto', left:0, right:0, background:'#fff', borderRadius:0}}>
 <div style={{background:'#1d4ed8', color:'#fff', padding:'12px 14px', display:'flex', alignItems:'center', gap:12}}>
 <button type='button' className='btn' style={{background:'transparent', color:'#fff', border:'none', padding:0}} onClick={() => setNotesComposerOpen(false)}>Cancel</button>
 <strong style={{margin:'0 auto'}}>Notes</strong>
 <button type='button' className='btn' style={{background:'transparent', color:'#fff', border:'none', padding:0}} onClick={() => {
 const cleaned = String(draftNote || '').trim()
 if (!cleaned) return setNotesComposerOpen(false)
 setSelectedLivestockRecord(prev => prev ? ({ ...prev, notes: cleaned }) : prev)
 setNotesComposerOpen(false)
 setNotesScreenOpen(true)
 }}>Done</button>
 </div>
 <div style={{background:'#fff', minHeight:420}}>
 <textarea autoFocus className='input' rows={14} placeholder='' value={draftNote} onChange={(e) => setDraftNote(e.target.value)} style={{width:'100%', minHeight:420, border:'none', borderRadius:0, padding:'16px', fontSize:'1rem', outline:'none', boxShadow:'none'}} />
 </div>
 </article>}

 {notesScreenOpen && (selectedOffspringRecord || selectedLivestockRecord) && <article className='panel' style={{padding:0, overflow:'auto', position:'fixed', inset:'0', zIndex:9999, maxWidth:560, margin:'0 auto', left:0, right:0, background:'#fff', borderRadius:0}}>
 <div style={{background:'#1d4ed8', color:'#fff', padding:'12px 14px', display:'flex', alignItems:'center', gap:12}}>
 <button type='button' className='btn' style={{background:'transparent', color:'#fff', border:'none', padding:0}} onClick={() => setNotesScreenOpen(false)}>‹</button>
 <strong>{String((selectedOffspringRecord || selectedLivestockRecord).id || '0001').padStart(4,'0')}</strong>
 <div style={{fontWeight:700}}>Notes</div>
 <button type='button' className='btn' style={{marginLeft:'auto', background:'transparent', color:'#fff', border:'none', fontSize:'1.4rem'}} onClick={() => { setDraftNote(''); setNotesComposerOpen(true) }}>+</button>
 </div>
 <div style={{padding:12, background:'#f8fafc'}}>
 <input className='input' placeholder='Search' value={notesSearch} onChange={(e) => setNotesSearch(e.target.value)} style={{background:'#1e3a8a', color:'#fff', border:'none', borderRadius:12}} />
 </div>
 <div style={{background:'#fff', minHeight:320}}>
 {[{date: (selectedOffspringRecord || selectedLivestockRecord).date_of_birth || '2023-07-08', text: (selectedOffspringRecord || selectedLivestockRecord).notes || 'Brown local boboji with black ewe'}]
 .filter(note => !notesSearch || `${note.date} ${note.text}`.toLowerCase().includes(notesSearch.toLowerCase()))
 .map((note, idx) => <div key={`note-row-${idx}`} style={{borderTop:'1px solid #eef2f7'}}>
 <div style={{padding:'16px 16px 8px', color:'#6b7280', fontWeight:700}}>{new Date(note.date).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }).toUpperCase()}</div>
 <div className='list-row' style={{padding:'0 16px 14px', alignItems:'center'}}><span style={{fontWeight:700, color:'#111827'}}>{note.text}</span><strong style={{marginLeft:'auto', color:'#9ca3af'}}>›</strong></div>
 </div>)}
 </div>
 </article>}

 {breederReportOpen && selectedBreederDetail && <article className='panel' style={{padding:0, overflow:'auto', position:'fixed', inset:'0', zIndex:9999, maxWidth:560, margin:'0 auto', left:0, right:0, background:'#fff', boxShadow:'0 20px 60px rgba(15,23,42,.28)', borderRadius:0}}>
 <div style={{background:'#1d4ed8', color:'#fff', padding:'12px 14px', display:'flex', alignItems:'center', gap:12}}>
 <button type='button' className='btn' style={{background:'transparent', color:'#fff', border:'none', padding:0}} onClick={() => setSelectedBreederDetail(null)}>‹</button>
 <strong style={{fontSize:'1.05rem'}}>{selectedBreederDetail.id}</strong>
 <div style={{fontWeight:700}}>{selectedBreederDetail.name}</div>
 <button type='button' className='btn' style={{marginLeft:'auto', background:'transparent', color:'#fff', border:'none'}}>Edit</button>
 </div>
 <div style={{background:'#fff'}}>
 {[
 ['Name', selectedBreederDetail.name],
 ['Phone', selectedBreederDetail.phone],
 ['Email', selectedBreederDetail.email],
 ['Address', selectedBreederDetail.address],
 ['Scrapie Tag Prefix', selectedBreederDetail.scrapiePrefix],
 ['Notes', selectedBreederDetail.notes],
 ].map(([label, value], idx) => <div key={`breeder-detail-${label}-${idx}`} className='list-row' style={{padding:'14px 16px', borderBottom:'1px solid #eef2f7', alignItems:'center'}}><span style={{color:'#1e3a8a', fontWeight:600}}>{label}</span><strong style={{marginLeft:'auto', color:'#111827', textAlign:'right'}}>{value}</strong></div>)}
 <div style={{padding:'12px 16px', background:'#eef4ff', color:'#6b7280', fontWeight:700, letterSpacing:'.02em'}}>PHOTOS & DOCS</div>
 <input ref={breederPhotoInputRef} type='file' accept='image/*' capture='environment' multiple style={{display:'none'}} onChange={(e) => handleBreederPhotoFiles(e.target.files)} />
 <input ref={breederDocInputRef} type='file' accept='.pdf,.doc,.docx,.txt,.rtf,.csv,.xls,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain' multiple style={{display:'none'}} onChange={(e) => handleBreederDocFiles(e.target.files)} />
 <div className='list-row' style={{padding:'14px 16px', borderBottom:'1px solid #eef2f7', alignItems:'center', cursor:'pointer'}} onClick={() => breederPhotoInputRef.current?.click()}><span style={{color:'#111827', fontWeight:600}}>Add Photo</span><strong style={{marginLeft:'auto', color:'#9ca3af'}}>›</strong></div>
 <div className='list-row' style={{padding:'14px 16px', borderBottom:'1px solid #eef2f7', alignItems:'center', cursor:'pointer'}} onClick={() => breederDocInputRef.current?.click()}><span style={{color:'#111827', fontWeight:600}}>Add Doc</span><strong style={{marginLeft:'auto', color:'#9ca3af'}}>›</strong></div>
 {(breederUploads.photos || []).map((file, idx) => <div key={`breeder-photo-${idx}`} className='list-row' style={{padding:'10px 16px', borderBottom:'1px solid #eef2f7', alignItems:'center'}}><span style={{color:'#475569'}}>📷 {file.name}</span><strong style={{marginLeft:'auto', color:'#94a3b8'}}>{Math.round((file.size || 0)/1024)} KB</strong></div>)}
 {(breederUploads.docs || []).map((file, idx) => <div key={`breeder-doc-${idx}`} className='list-row' style={{padding:'10px 16px', borderBottom:'1px solid #eef2f7', alignItems:'center'}}><span style={{color:'#475569'}}>📄 {file.name}</span><strong style={{marginLeft:'auto', color:'#94a3b8'}}>{Math.round((file.size || 0)/1024)} KB</strong></div>)}
 <div className='list-row' style={{padding:'14px 16px', borderBottom:'1px solid #eef2f7', alignItems:'center', cursor:'pointer'}} onClick={() => setBreederReportOpen(true)}><span style={{color:'#111827', fontWeight:600}}>View Breeder Report</span><strong style={{marginLeft:'auto', color:'#9ca3af'}}>›</strong></div>
 </div>
 </article>}

 <div style={{width:'100%', overflowX:'auto', WebkitOverflowScrolling:'touch'}}>
 <DataTable
 columns={['id','species','animal_type','name','acquisition_date','purchased_from','purchase_price','health_status']}
 rows={livestockRecordsFiltered}
 filterKey='name'
 onRowClick={(r) => { setSelectedLivestockRecord(r); setRecordsSectionOpen(prev => ({ ...prev, details: true })) }}
 onEdit={(r) => {
 const nextRecord = { ...r }
 setSelectedLivestockRecord(nextRecord)
 setLivestockRecordEdit(mapLivestockRecordToEditForm(nextRecord))
 setRecordsSectionOpen(prev => ({ ...prev, edit: true, create: false, details: true }))
 }}
 />
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
 </div>
 <form className='list' onSubmit={async(e)=>{
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
 <label style={{fontSize:'.85rem',color:'#475569'}}>Display picture</label>
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

 <label style={{fontSize:'.85rem',color:'#475569'}}>Cover image</label>
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
 <input className='input' placeholder='Main name / display name' value={communityProfile.full_name || ''} onChange={(e)=>{ setCommunityProfileDirty(true); setCommunityProfile({...communityProfile, full_name:e.target.value}) }} />
 <input className='input' placeholder='Username (e.g. akhen_farmer)' value={communityProfile.username || ''} onChange={(e)=>{ setCommunityProfileDirty(true); setCommunityProfile({...communityProfile, username:e.target.value.toLowerCase().replace(/\s+/g,'')}) }} />
 <input className='input' placeholder='Bio' value={communityProfile.bio || ''} onChange={(e)=>{ setCommunityProfileDirty(true); setCommunityProfile({...communityProfile, bio:e.target.value}) }} />
 <input className='input' placeholder='Farm life details' value={communityProfile.farm_life || ''} onChange={(e)=>{ setCommunityProfileDirty(true); setCommunityProfile({...communityProfile, farm_life:e.target.value}) }} />
 <input className='input' placeholder='Interests/tags (comma separated)' value={communityProfile.interests || ''} onChange={(e)=>{ setCommunityProfileDirty(true); setCommunityProfile({...communityProfile, interests:e.target.value}) }} />
 <select className='input' value={communityProfile.visibility || 'PUBLIC'} onChange={(e)=>{ setCommunityProfileDirty(true); setCommunityProfile({...communityProfile, visibility:e.target.value}) }}>
 <option value='PUBLIC'>Public</option>
 <option value='FOLLOWERS'>Followers only</option>
 </select>
 <button className='btn btn-dark' disabled={communityProfileSaving}>{communityProfileSaving ? 'Saving Profile…' : 'Save Profile'}</button>
 </form>
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
 <div className='tabs' style={{marginBottom:8, flexWrap:'wrap'}}>
 <button className={`tab ${communityFeedMode === 'for-you' ? 'active' : ''}`} onClick={()=>setCommunityFeedMode('for-you')}>For You</button>
 <button className={`tab ${communityFeedMode === 'following' ? 'active' : ''}`} onClick={()=>setCommunityFeedMode('following')}>Following</button>
 <button className={`tab ${communityFeedMode === 'reels' ? 'active' : ''}`} onClick={()=>setCommunityFeedMode('reels')}>FarmReels</button>
 </div>
 <div className='list'>
 {(communityFeedMode === 'reels' ? communityPosts.filter(x => String(x.media_type || '').toUpperCase() === 'VIDEO') : communityPosts).map((p)=><div key={`cp-${p.id}`} className='panel' style={{padding:10,border:'1px solid #dbe6df',boxShadow:'0 1px 6px rgba(0,0,0,.05)'}}>
 <div className='list-row' style={{alignItems:'center', gap:10}}>
 <div style={{display:'flex',alignItems:'center',gap:10}}>
 {isUserImage(p.author_avatar_url)
 ? <img src={p.author_avatar_url} alt='Author avatar' style={{width:42,height:42,objectFit:'cover',borderRadius:'50%',border:'1px solid #e2e8f0'}} />
 : <div style={{width:42,height:42,borderRadius:'50%',background:'#e2e8f0',display:'grid',placeItems:'center',color:'#64748b',fontSize:'.75rem'}}>No DP</div>}
 <div>
 <strong>{p.author_full_name || p.author_name || `User ${p.user_id}`} {p.author_country ? `(${p.author_country})` : ''}</strong>
 <div style={{fontSize:'.78rem', color:'#0284c7'}}>{p.author_username ? `@${p.author_username}` : ''}</div>
 </div>
 </div>
 <span style={{fontSize:'.78rem', color:'#64748b'}}>{String(p.created_at || '').replace('T',' ').slice(0,16)}</span>
 </div>
 {p.text && <div style={{margin:'6px 0', whiteSpace:'pre-wrap'}}>{p.text}</div>}
 {p.media_url && (
 p.media_type === 'VIDEO'
 ? <video src={p.media_url} controls style={{width:'100%', maxHeight:360, borderRadius:10, background:'#000'}} />
 : <img src={p.media_url} alt='community post' style={{width:'100%', maxHeight:360, objectFit:'cover', borderRadius:10}} />
 )}
 {!!p.tags && <div style={{fontSize:'.82rem', color:'#0284c7', marginTop:6}}>#{String(p.tags).split(',').map(s=>s.trim()).filter(Boolean).join(' #')}</div>}
 <div className='list-row' style={{marginTop:8, flexWrap:'wrap', gap:8}}>
 <button className='btn' onClick={async()=>{ await api.toggleCommunityPostLike(p.id); await loadCommunity(); }}>👍 Like ({p.likes_count || 0})</button>
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
 <input className='input' placeholder='User ID' value={diseaseForm.user_id} onChange={(e)=>setDiseaseForm({...diseaseForm,user_id:e.target.value,category:'animal'})} />
 <select className='input' value={diseaseForm.target} onChange={(e)=>setDiseaseForm({...diseaseForm,category:'animal',target:e.target.value})} required>
 <option value=''>Select animal</option>
 {animalOptions.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
 </select>
 <textarea className='input' placeholder='Describe animal symptoms (optional): e.g., coughing, discharge, lesions, diarrhea, fever...' value={diseaseForm.context_note || ''} onChange={(e)=>setDiseaseForm({...diseaseForm,context_note:e.target.value,category:'animal'})} rows={3} style={{minWidth:'100%'}} />
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
 <button className='btn btn-dark' disabled={diseaseAnalyzing}>{diseaseAnalyzing ? 'FarmSavior is analyzing…' : 'Analyze'}</button>
 </form>
 {diseaseAnalyzing && <div className='panel list' style={{marginBottom:12}}><div className='list-row'><strong>🌿 FarmSavior</strong><span>Analyzing image…</span></div><div style={{fontSize:'.9rem', color:'#64748b'}}>Please wait while FarmSavior checks the image, compares likely conditions, and prepares treatment guidance.</div></div>}
 {diseaseImageFileName && <p style={{fontSize:'.82rem',color:'#475569'}}>Uploaded: {diseaseImageFileName}</p>}
 {diseaseImagePreview && <img src={diseaseImagePreview} alt='Disease scan preview' style={{maxWidth:260,borderRadius:8,border:'1px solid #e2e8f0',marginBottom:8}} />}
 {diseaseResult && <div className='panel list' style={{marginBottom:12}}>
 <div className='list-row'><strong>Primary assessment</strong><span>{diseaseResult.diagnosis} ({Math.round((diseaseResult.confidence || 0) * 100)}%)</span></div>
 <div className='list-row'><strong>Evidence strength</strong><span>{diseaseResult.analysis_signal || 'unknown'}{diseaseResult.insufficient_evidence ? ' · low evidence' : ''}</span></div>
 <div><strong>How to differentiate</strong><div style={{marginTop:6}}>{Array.isArray(diseaseResult.differentiation) ? diseaseResult.differentiation.join(' • ') : (diseaseResult.differentiation || '-')}</div></div>
 <div><strong>Prevention</strong><div style={{marginTop:6}}>{Array.isArray(diseaseResult.prevention) ? diseaseResult.prevention.join(' • ') : (diseaseResult.prevention || diseaseResult.recommendation || '-')}</div></div>
 <div><strong>Treatment</strong><div style={{marginTop:6}}>{diseaseResult.treatment || '-'}</div></div>
 <div><strong>Top 3 possible conditions</strong>
 <div style={{display:'grid',gap:10,marginTop:8}}>
 {(diseaseResult.top_matches || []).map((m, idx) => <div key={`${m.diagnosis}-${idx}`} className='panel' style={{padding:12}}>
 <div className='list-row'><strong>{idx + 1}. {m.diagnosis}</strong><span>{Math.round((m.confidence || 0) * 100)}%</span></div>
 <div style={{fontSize:'.92rem',marginTop:6}}><strong>Why it matches:</strong> {Array.isArray(m.why_it_matches) && m.why_it_matches.length ? m.why_it_matches.join(' • ') : '-'}</div>
 <div style={{fontSize:'.92rem',marginTop:6}}><strong>How to tell apart:</strong> {Array.isArray(m.how_to_tell_apart) ? m.how_to_tell_apart.join(' • ') : (m.how_to_tell_apart || '-')}</div>
 <div style={{fontSize:'.92rem',marginTop:6}}><strong>Prevention:</strong> {Array.isArray(m.prevention) ? m.prevention.join(' • ') : (m.prevention || '-')}</div>
 <div style={{fontSize:'.92rem',marginTop:6}}><strong>Treatment:</strong> {m.treatment || '-'}</div>
 </div>)}
 </div>
 </div>
 <div style={{fontSize:'.9rem',color:'#7f1d1d'}}>{diseaseResult.vet_notice || 'Important: Contact a licensed veterinarian for confirmation before treatment.'}</div>
 </div>}
 <DataTable columns={['id','user_id','image_url','result','created_at']} rows={state.diseaseScans.filter(r => !r.category || String(r.category).toLowerCase() === 'animal')} filterKey='result' />
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
