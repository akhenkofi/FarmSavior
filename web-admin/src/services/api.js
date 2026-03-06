import axios from 'axios'

const rawBaseUrl = import.meta.env.VITE_API_BASE_URL || 'https://api.farmsavior.com/api/v1'
const baseURL = rawBaseUrl.replace(/^http:\/\/api\.farmsavior\.com/i, 'https://api.farmsavior.com')

const api = axios.create({ baseURL })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('farmsavior_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export const register = async (payload) => (await api.post('/auth/register', payload)).data
export const login = async (payload) => (await api.post('/auth/login', payload)).data
export const verifyOtp = async (payload) => (await api.post('/auth/verify-otp', payload)).data
export const fetchMe = async () => (await api.get('/auth/me')).data

export const fetchMetrics = async () => (await api.get('/admin/metrics')).data
export const fetchAdminDisputes = async () => (await api.get('/admin/disputes')).data
export const fetchAdminFraudFlags = async () => (await api.get('/admin/fraud-flags')).data
export const fetchUsers = async () => (await api.get('/users')).data

export const fetchListings = async () => (await api.get('/marketplace/listings')).data
export const createListing = async (payload) => (await api.post('/marketplace/listings', payload)).data
export const updateListing = async (id, payload) => (await api.put(`/marketplace/listings/${id}`, payload)).data
export const patchListingPriceQty = async (id, payload) => (await api.patch(`/marketplace/listings/${id}/price-qty`, payload)).data

export const fetchLivestock = async () => (await api.get('/marketplace/livestock')).data
export const createLivestock = async (payload) => (await api.post('/marketplace/livestock', payload)).data
export const updateLivestock = async (id, payload) => (await api.put(`/marketplace/livestock/${id}`, payload)).data
export const patchLivestockPriceQty = async (id, payload) => (await api.patch(`/marketplace/livestock/${id}/price-qty`, payload)).data

export const fetchLogistics = async () => (await api.get('/services/logistics')).data
export const createLogistics = async (payload) => (await api.post('/services/logistics', payload)).data
export const updateLogistics = async (id, payload) => (await api.put(`/services/logistics/${id}`, payload)).data

export const fetchEquipment = async () => (await api.get('/services/equipment-rentals')).data
export const createEquipment = async (payload) => (await api.post('/services/equipment-rentals', payload)).data
export const updateEquipment = async (id, payload) => (await api.put(`/services/equipment-rentals/${id}`, payload)).data

export const fetchStorage = async () => (await api.get('/services/storage-reservations')).data
export const createStorage = async (payload) => (await api.post('/services/storage-reservations', payload)).data
export const updateStorage = async (id, payload) => (await api.put(`/services/storage-reservations/${id}`, payload)).data

export const fetchPayments = async () => (await api.get('/payments')).data
export const createPayment = async (payload) => (await api.post('/payments', payload)).data
export const updatePayment = async (id, payload) => (await api.put(`/payments/${id}`, payload)).data

export const fetchAlerts = async (country) => (await api.get('/weather/alerts', { params: country ? { country } : {} })).data
export const createAlert = async (payload) => (await api.post('/weather/alerts', payload)).data
export const updateAlert = async (id, payload) => (await api.put(`/weather/alerts/${id}`, payload)).data
export const syncWeather = async () => (await api.post('/weather/sync')).data
export const fetchWeatherRegions = async () => (await api.get('/weather/regions')).data

export const fetchContracts = async () => (await api.get('/trade/contracts')).data
export const createContract = async (payload) => (await api.post('/trade/contracts', payload)).data
export const updateContract = async (id, payload) => (await api.put(`/trade/contracts/${id}`, payload)).data

export const fetchIdVerifications = async () => (await api.get('/onboarding/id-verification')).data
export const createIdVerification = async (payload) => (await api.post('/onboarding/id-verification', payload)).data

export const fetchPassports = async () => (await api.get('/onboarding/farm-passport')).data
export const createPassport = async (payload) => (await api.post('/onboarding/farm-passport', payload)).data

export const fetchVerificationApps = async () => (await api.get('/verification/applications')).data
export const analyzeVerification = async (idVerificationId) => (await api.post(`/verification/analyze/${idVerificationId}`)).data
export const analyzeAllVerifications = async () => (await api.post('/verification/analyze-all')).data
export const setVerificationDecision = async (idVerificationId, payload) => (await api.post(`/verification/decision/${idVerificationId}`, payload)).data
export const fetchApprovedAccounts = async () => (await api.get('/verification/approved-accounts')).data

export const fetchMapConfig = async () => (await api.get('/map/config')).data
export const fetchPublicNews = async () => (await api.get('/news/public')).data
export const fetchPublicWeather = async () => (await api.get('/weather/public-main')).data

export const fetchGovPrograms = async () => (await api.get('/gov/programs')).data
export const govDistributeSubsidy = async (payload) => (await api.post('/gov/subsidies/distribute', payload)).data
export const govCommunicate = async (payload) => (await api.post('/gov/communicate', payload)).data
export const fetchSpotTrading = async () => (await api.get('/market/spot-trading')).data
export const fetchSpotTradingHistory = async () => (await api.get('/market/spot-trading/history')).data
export const fetchTradeExportStats = async () => (await api.get('/trade/export-stats')).data
export const fetchLivestockRecordsPlans = async () => (await api.get('/livestock-records/subscription/plans')).data
export const checkoutLivestockRecordsPlan = async (payload) => (await api.post('/livestock-records/subscription/checkout', payload)).data

export const registerDeviceToken = async (payload) => (await api.post('/messaging/device-token', payload)).data
export const fetchDeviceTokens = async () => (await api.get('/messaging/device-token')).data

export const analyzeDisease = async (payload) => (await api.post('/ai/disease/analyze', payload)).data
export const fetchDiseaseScans = async () => (await api.get('/ai/disease/scans')).data

export const trackAnalyticsEvent = async (payload) => (await api.post('/analytics/events', payload)).data
export const fetchUsersAnalyticsSummary = async () => (await api.get('/analytics/users/summary')).data

export const fetchWorldChatMessages = async (limit = 80) => (await api.get('/chat/world/messages', { params: { limit } })).data
export const postWorldChatMessage = async (payload) => (await api.post('/chat/world/messages', payload)).data
export const fetchWorldChatModerationQueue = async (limit = 100) => (await api.get('/chat/world/moderation/queue', { params: { limit } })).data
export const setWorldChatModerationAction = async (payload) => (await api.post('/chat/world/moderation/action', payload)).data
export const sanctionWorldChatUser = async (userId, payload) => (await api.post(`/chat/world/users/${userId}/sanction`, payload)).data
