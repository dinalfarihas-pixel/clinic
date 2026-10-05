// stores/index.js (or wherever your stores are)
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useConfigStore = defineStore('config', {
  state: () => {
    const isProd = true // 'production' // import.meta.env.MODE === 'development'
    return {
      mode: isProd ? 'production' : 'development',
      apiBaseUrl:
        isProd == true
          ? 'https://ws-simrs.net/ws_sim_v2' //'https://ws-simrs.link/ws_sim_v2'
          : 'https://ws-simrs.net/ws_sim_v2_tester',

      apiApotikUrl:
        isProd == true
          ? 'https://ws-simrs.net/ws_posindo_v2.1' //'https://ws-simrs.link/ws_posindo_v2.1'
          : 'https://ws-simrs.net/ws_posindo_v2.1_tester',

      simrs:
        isProd == true
          ? 'https://ws-simrs.net/ws_sim_v2' //'https://ws-simrs.link/ws_sim_v2'
          : 'https://ws-simrs.net/ws_sim_v2_tester',

      laravel: isProd == true ? 'https://simrs-link.site/api' : 'https://simrs-link.site/api',

      sidebarCollapsed: localStorage.getItem('sb_collapsed') === '1',
      mobileSidebarOpen: false,
    }
  },
  actions: {
    toggleSidebar() {
      this.sidebarCollapsed = !this.sidebarCollapsed
      localStorage.setItem('sb_collapsed', this.sidebarCollapsed ? '1' : '0')
    },
    toggleMobileSidebar() {
      this.mobileSidebarOpen = !this.mobileSidebarOpen
    },
    closeMobileSidebar() {
      this.mobileSidebarOpen = false
    },
  },

  getters: {
    getApiUrl: (state) => state.apiBaseUrl,
    getApotikApi: (state) => state.apiApotikUrl,
    getSimrsApi: (state) => state.simrs,
    getMode: (state) => state.mode,
  },
})

export const useAuthStore = defineStore('auth', {
  state: () => ({
    id_client: localStorage.getItem('id_client') || null,
    user_name: localStorage.getItem('user_name') || null,
    user_id: localStorage.getItem('user_id') || null,
    company: localStorage.getItem('NAMA_RS') || null,
    ALAMAT: localStorage.getItem('ALAMAT') || null,
    LINK_LOGO: localStorage.getItem('LINK_LOGO') || null,
    kop_surat: localStorage.getItem('kop_surat') || null,
    PAYOR_ID: localStorage.getItem('PAYOR_ID') || null,
    KODE_PPK: localStorage.getItem('KODE_PPK') || null,
    id_lokasi: localStorage.getItem('id_lokasi') || null,
    use_tte_bsre: localStorage.getItem('use_tte_bsre') || null,
    disable_jika_sediaan_nol: localStorage.getItem('disable_jika_sediaan_nol') || null,
    tampilkan_no_urutan_display: localStorage.getItem('TAMPILKAN_NO_URUTAN_DISPLAY') ?? 0,
    group_user: localStorage.getItem('group_user') || null,
    kd_dokter: localStorage.getItem('kd_dokter') || null,
    // NEW: Add user object and job_code
    user: JSON.parse(localStorage.getItem('user') || 'null'),
    nik: localStorage.getItem('nik') || null,
    job_code: localStorage.getItem('job_code') || null,
    bidang_id: localStorage.getItem('bidang_id') || null,
    url_lis: 'http://naganraya.kliniscare.com/restapi/simrs/',
  }),

  actions: {
    setIdClient(
      id,
      name,
      user_id,
      company,
      ALAMAT,
      LINK_LOGO,
      id_lokasi,
      use_tte_bsre,
      disable_jika_sediaan_nol,
      group_user,
    ) {
      this.id_client = id
      this.user_name = name
      this.user_id = user_id
      this.company = company
      this.ALAMAT = ALAMAT
      this.LINK_LOGO = LINK_LOGO
      this.id_lokasi = id_lokasi
      this.group_user = group_user
      ;(this.use_tte_bsre = use_tte_bsre),
        (this.disable_jika_sediaan_nol = disable_jika_sediaan_nol)

      localStorage.setItem('id_client', id)
      localStorage.setItem('user_name', name)
      localStorage.setItem('user_id', user_id)
      localStorage.setItem('NAMA_RS', company)
      localStorage.setItem('ALAMAT', ALAMAT)
      localStorage.setItem('LINK_LOGO', LINK_LOGO)
      localStorage.setItem('id_lokasi', id_lokasi)
      localStorage.setItem('use_tte_bsre', use_tte_bsre)
      localStorage.setItem('disable_jika_sediaan_nol', disable_jika_sediaan_nol)
      localStorage.setItem('group_user', group_user)
    },

    // NEW: Set user data with job_code
    setUserData(userData) {
      this.user = userData
      this.nik = userData?.nik || userData?.NIK || null
      this.job_code = userData?.job_code || userData?.kode_jabatan || null
      this.bidang_id = userData?.bidang_id || userData?.LOKASI || null
      this.group_user = userData?.group_user || null
      this.kd_dokter = userData?.kd_dokter || null

      if (this.user) localStorage.setItem('user', JSON.stringify(this.user))
      if (this.nik) localStorage.setItem('nik', this.nik)
      if (this.job_code) localStorage.setItem('job_code', this.job_code)
      if (this.bidang_id) localStorage.setItem('bidang_id', this.bidang_id)
      if (this.group_user) localStorage.setItem('group_user', this.group_user)
      if (this.kd_dokter) localStorage.setItem('kd_dokter', this.kd_dokter)
    },

    setPayorId(payorId) {
      this.PAYOR_ID = payorId
      localStorage.setItem('PAYOR_ID', payorId)
    },

    setKodePpk(kodePpk) {
      this.KODE_PPK = kodePpk
      localStorage.setItem('KODE_PPK', kodePpk)
    },

    clearAuthData() {
      this.id_client = null
      this.user_name = null
      this.user_id = null
      this.company = null
      this.ALAMAT = null
      this.LINK_LOGO = null
      this.kop_surat = null
      this.PAYOR_ID = null
      this.KODE_PPK = null
      this.id_lokasi = null
      this.use_tte_bsre = 0
      this.tampilkan_no_urutan_display = 0
      this.user = null
      this.nik = null
      this.job_code = null
      this.bidang_id = null
      this.group_user = null
      this.kd_dokter = null

      localStorage.removeItem('id_client')
      localStorage.removeItem('user_name')
      localStorage.removeItem('user_id')
      localStorage.removeItem('NAMA_RS')
      localStorage.removeItem('ALAMAT')
      localStorage.removeItem('LINK_LOGO')
      localStorage.removeItem('kop_surat')
      localStorage.removeItem('PAYOR_ID')
      localStorage.removeItem('KODE_PPK')
      localStorage.removeItem('loggedIn')
      localStorage.removeItem('id_lokasi')
      localStorage.removeItem('use_tte_bsre')
      localStorage.removeItem('TAMPILKAN_NO_URUTAN_DISPLAY')
      localStorage.removeItem('job_code')
      localStorage.removeItem('bidang_id')
      localStorage.removeItem('group_user')
      localStorage.removeItem('kd_dokter')
      localStorage.removeItem('user')
      localStorage.removeItem('nik')
    },
  },
})

export const useGlobalStore = defineStore('global', () => {
  const step = ref('1')

  const setStep = (newValue) => {
    step.value = newValue
  }

  return {
    step,
    setStep,
  }
})
