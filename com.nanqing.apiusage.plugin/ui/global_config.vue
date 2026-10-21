<template>
  <v-container fluid class="pa-4">
    <v-row>
      <v-col cols="12">
        <v-card prepend-icon="mdi-key-variant" title="API 用量监控 - 接口配置">
          <v-card-text>
            <v-row>
              <v-col cols="12" md="4">
                <v-text-field
                  v-model.number="modelValue.config.intervalSeconds"
                  type="number"
                  label="API 刷新间隔（秒）"
                  min="5"
                  max="3600"
                  suffix="s"
                  hide-details
                  density="compact"
                  variant="outlined"
                />
              </v-col>
              <v-col cols="12" md="8" class="d-flex align-center">
                <v-switch
                  v-model="modelValue.config.asciiOnlyTitles"
                  color="primary"
                  hide-details
                  density="compact"
                  label="按键标题仅使用 ASCII 字符（设备字体不含中文字形，关闭后中文会显示为方框）"
                />
              </v-col>
            </v-row>

            <v-divider class="my-4" />

            <v-row>
              <v-col
                v-for="(provider, id) in modelValue.config.providers"
                :key="id"
                cols="12"
                md="6"
                xl="4"
              >
                <v-card variant="outlined" class="pa-3">
                  <v-card-title class="d-flex align-center px-0 pt-0">
                    <v-switch
                      v-model="provider.enabled"
                      color="primary"
                      hide-details
                      density="compact"
                      class="mr-2"
                    />
                    <span class="text-body-1 font-weight-bold">{{ provider.name || id }}</span>
                    <v-spacer />
                    <v-chip size="x-small" variant="tonal" class="ml-2">{{ id }}</v-chip>
                  </v-card-title>

                  <v-text-field
                    v-model="provider.name"
                    label="显示名称"
                    density="compact"
                    variant="outlined"
                    hide-details
                    class="mb-2"
                  />

                  <v-text-field
                    v-model="provider.apiKey"
                    label="API Key"
                    type="password"
                    density="compact"
                    variant="outlined"
                    hide-details
                    class="mb-2"
                  />

                  <v-row dense>
                    <v-col cols="7">
                      <v-text-field
                        v-model="provider.unit"
                        label="单位"
                        density="compact"
                        variant="outlined"
                        hide-details
                        class="mb-2"
                      />
                    </v-col>
                    <v-col cols="5">
                      <v-text-field
                        v-model.number="provider.scale"
                        type="number"
                        label="数值倍率"
                        density="compact"
                        variant="outlined"
                        hide-details
                        class="mb-2"
                      />
                    </v-col>
                  </v-row>

                  <div class="d-flex align-center">
                    <v-btn
                      size="small"
                      variant="text"
                      :prepend-icon="expanded[id] ? 'mdi-chevron-up' : 'mdi-chevron-down'"
                      @click="toggle(id)"
                    >
                      {{ expanded[id] ? '收起高级设置' : '高级设置' }}
                    </v-btn>
                    <v-spacer />
                    <v-btn
                      size="small"
                      variant="text"
                      color="secondary"
                      prepend-icon="mdi-restore"
                      @click="resetProvider(id)"
                    >
                      默认
                    </v-btn>
                    <v-btn
                      size="small"
                      variant="tonal"
                      color="primary"
                      prepend-icon="mdi-access-point-check"
                      :loading="testing[id]"
                      @click="testProvider(id)"
                    >
                      测试
                    </v-btn>
                  </div>

                  <template v-if="expanded[id]">
                    <v-divider class="my-2" />

                    <v-text-field
                      v-model="provider.endpoint"
                      label="接口地址"
                      density="compact"
                      variant="outlined"
                      hide-details
                      class="mb-2"
                    />

                    <v-select
                      v-model="provider.authType"
                      :items="authTypes"
                      item-title="title"
                      item-value="value"
                      label="认证方式"
                      density="compact"
                      variant="outlined"
                      hide-details
                      class="mb-2"
                    />

                    <template v-if="provider.authType === 'custom'">
                      <v-text-field
                        v-model="provider.headerName"
                        label="Header 名称"
                        density="compact"
                        variant="outlined"
                        hide-details
                        class="mb-2"
                      />
                      <v-text-field
                        v-model="provider.headerPrefix"
                        label="Header 前缀"
                        density="compact"
                        variant="outlined"
                        hide-details
                        class="mb-2"
                      />
                    </template>

                    <v-text-field
                      v-model="provider.query"
                      label="查询参数（支持占位符）"
                      density="compact"
                      variant="outlined"
                      hide-details
                      class="mb-2"
                    />

                    <v-text-field
                      v-model="provider.valuePath"
                      label="JSON 取值路径"
                      density="compact"
                      variant="outlined"
                      hide-details
                      class="mb-2"
                    />

                    <v-text-field
                      v-model="provider.valueField"
                      label="取值字段（可选）"
                      density="compact"
                      variant="outlined"
                      hide-details
                      class="mb-2"
                    />

                    <v-text-field
                      v-model="provider.sumField"
                      label="汇总字段（可选，填了就不再用取值路径）"
                      density="compact"
                      variant="outlined"
                      hide-details
                      class="mb-2"
                    />

                    <v-text-field
                      v-model="provider.currency"
                      label="货币筛选（可选，如 CNY）"
                      density="compact"
                      variant="outlined"
                      hide-details
                      class="mb-2"
                    />
                  </template>
                </v-card>
              </v-col>
            </v-row>

            <v-alert type="info" variant="tonal" density="compact" class="mt-4">
              <div class="text-body-2">
                占位符：<code>{monthStart}</code> 本月开始的 Unix 秒、<code>{monthStartISO}</code> 本月开始的 ISO 时间、
                <code>{now}</code> 当前 Unix 秒、<code>{nowISO}</code> 当前 ISO 时间、<code>{days7ISO}</code> / <code>{days30ISO}</code> / <code>{days31ISO}</code>、<code>{yesterdayISO}</code>、<code>{yearStart}</code>、<code>{yearStartISO}</code>。
              </div>
              <div class="text-body-2 mt-2">
                ChatGPT 的 <code>/v1/organization/costs</code> 与 Claude 的 <code>/v1/organizations/cost_report</code> 都要求组织 Admin / Enterprise Key，普通 Key 会返回 401 / 403。
                Claude 返回的 <code>amount</code> 单位是「分」，所以默认倍率为 0.01；若你的接口直接返回元，请把倍率改为 1。
                国内网络访问不通时可把接口地址改成中转地址。
              </div>
            </v-alert>
          </v-card-text>

          <v-card-actions>
            <v-btn color="primary" variant="flat" prepend-icon="mdi-content-save" @click="saveConfig">
              保存
            </v-btn>
            <v-spacer />
            <v-btn variant="text" prepend-icon="mdi-restore" @click="resetDefaults">
              全部恢复默认
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
const DEFAULT_CONFIG = {
  intervalSeconds: 30,
  asciiOnlyTitles: true,
  providers: {
    deepseek: {
      enabled: true, name: 'DeepSeek', apiKey: '',
      endpoint: 'https://api.deepseek.com/user/balance',
      authType: 'bearer', headerName: '', headerPrefix: '', query: '',
      valuePath: 'balance_infos', valueField: 'total_balance', currency: 'CNY',
      sumField: '', scale: 1, unit: 'CNY'
    },
    kimi: {
      enabled: true, name: 'Kimi', apiKey: '',
      endpoint: 'https://api.moonshot.ai/v1/users/me/balance',
      authType: 'bearer', headerName: '', headerPrefix: '', query: '',
      valuePath: 'data.available_balance', valueField: '', currency: '',
      sumField: '', scale: 1, unit: 'USD'
    },
    chatgpt: {
      enabled: true, name: 'ChatGPT', apiKey: '',
      endpoint: 'https://api.openai.com/v1/organization/costs',
      authType: 'bearer', headerName: '', headerPrefix: '',
      query: 'start_time={monthStart}&end_time={now}&bucket_width=1d&limit=180',
      valuePath: '', valueField: '', currency: '',
      sumField: 'amount.value', scale: 1, unit: 'USD'
    },
    claude: {
      enabled: true, name: 'Claude', apiKey: '',
      endpoint: 'https://api.anthropic.com/v1/organizations/cost_report',
      authType: 'x-api-key', headerName: '', headerPrefix: '',
      query: 'starting_at={monthStartISO}&ending_at={nowISO}&bucket_width=1d&limit=31',
      valuePath: '', valueField: '', currency: '',
      sumField: 'amount', scale: 0.01, unit: 'USD'
    },
    custom: {
      enabled: true, name: 'Custom', apiKey: '',
      endpoint: '', authType: 'bearer', headerName: 'Authorization', headerPrefix: 'Bearer ', query: '',
      valuePath: '', valueField: '', currency: '',
      sumField: '', scale: 1, unit: ''
    }
  }
};

function deepMerge(target, source) {
  const out = { ...target };
  for (const key of Object.keys(source || {})) {
    const s = source[key];
    const t = out[key];
    if (s && typeof s === 'object' && !Array.isArray(s)) {
      out[key] = deepMerge(t || {}, s);
    } else {
      out[key] = s;
    }
  }
  return out;
}

function normalizeConfig(cfg) {
  const base = deepMerge(DEFAULT_CONFIG, cfg || {});
  const merged = {};
  for (const id of Object.keys(DEFAULT_CONFIG.providers)) {
    merged[id] = deepMerge(DEFAULT_CONFIG.providers[id], (base.providers || {})[id] || {});
  }
  base.providers = merged;
  return base;
}

export default {
  name: 'ApiUsageGlobalConfig',
  props: {
    modelValue: {
      type: Object,
      required: true
    }
  },
  data() {
    return {
      expanded: {},
      testing: {},
      authTypes: [
        { title: 'Bearer', value: 'bearer' },
        { title: 'x-api-key', value: 'x-api-key' },
        { title: '自定义 Header', value: 'custom' },
        { title: '无认证', value: 'none' }
      ]
    };
  },
  mounted() {
    if (!this.modelValue.config) {
      this.modelValue.config = {};
    }
    const normalized = normalizeConfig(this.modelValue.config);
    Object.keys(normalized).forEach((k) => {
      this.modelValue.config[k] = normalized[k];
    });
  },
  methods: {
    getFd() {
      if (this.$fd) return this.$fd;
      if (typeof window !== 'undefined') {
        return window.$fd || window.flexdesignerAPI || window.flexdesigner || null;
      }
      return null;
    },
    toggle(id) {
      this.expanded = { ...this.expanded, [id]: !this.expanded[id] };
    },
    async persist(silent) {
      const fd = this.getFd();
      if (!fd || !fd.setConfig) {
        alert('找不到保存接口：' + (fd ? '缺少 setConfig' : '$fd 未定义'));
        return false;
      }
      try {
        await fd.setConfig(this.modelValue.config);
        if (!silent && fd.showSnackbarMessage) fd.showSnackbarMessage('success', '配置已保存');
        return true;
      } catch (e) {
        alert('保存失败: ' + (e && e.message ? e.message : String(e)));
        return false;
      }
    },
    async saveConfig() {
      await this.persist(false);
    },
    async testProvider(id) {
      if (!this.modelValue.config) this.modelValue.config = {};
      this.testing = { ...this.testing, [id]: true };
      // A nonce makes the backend run each request exactly once.
      this.modelValue.config.testRequest = { provider: id, nonce: Date.now() };
      const ok = await this.persist(true);
      this.testing = { ...this.testing, [id]: false };
      if (!ok) return;
      const fd = this.getFd();
      if (fd && fd.showSnackbarMessage) {
        fd.showSnackbarMessage('info', '已发起测试，结果会在弹窗中显示（详见组件日志）');
      }
    },
    resetProvider(id) {
      const providers = (this.modelValue.config || {}).providers || {};
      const current = providers[id] || {};
      const defaults = DEFAULT_CONFIG.providers[id];
      if (!defaults) return;
      providers[id] = {
        ...deepMerge(defaults, {}),
        enabled: current.enabled !== false,
        apiKey: current.apiKey || ''
      };
      this.modelValue.config.providers = { ...providers };
      this.persist(true);
    },
    resetDefaults() {
      if (!this.modelValue.config) this.modelValue.config = {};
      const providers = this.modelValue.config.providers || {};
      const defaults = normalizeConfig({});
      Object.keys(defaults).forEach((k) => {
        if (k !== 'providers') this.modelValue.config[k] = defaults[k];
      });
      const next = {};
      Object.keys(defaults.providers).forEach((id) => {
        const current = providers[id] || {};
        next[id] = deepMerge(defaults.providers[id], {
          enabled: current.enabled !== false,
          apiKey: current.apiKey || ''
        });
      });
      this.modelValue.config.providers = next;
      this.saveConfig();
    }
  }
};
</script>

<style scoped></style>
