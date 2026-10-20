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

                  <template v-if="id === 'custom'">
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
                      label="查询参数（可选）"
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
                      label="汇总字段（可选）"
                      density="compact"
                      variant="outlined"
                      hide-details
                      class="mb-2"
                    />
                  </template>

                  <v-text-field
                    v-model="provider.currency"
                    label="货币筛选（可选）"
                    density="compact"
                    variant="outlined"
                    hide-details
                    class="mb-2"
                  />

                  <v-text-field
                    v-model="provider.unit"
                    label="单位"
                    density="compact"
                    variant="outlined"
                    hide-details
                  />
                </v-card>
              </v-col>
            </v-row>

            <v-alert type="warning" variant="tonal" density="compact" class="mt-4">
              ChatGPT 需要组织 Admin Key；Claude 需要 Admin Key，并会自动附加 anthropic-version 头。Custom 可填写任意 JSON 接口。查询参数支持 {monthStart}、{monthStartISO}、{now}、{nowISO} 占位符。
            </v-alert>
          </v-card-text>

          <v-card-actions>
            <v-btn
              color="primary"
              variant="flat"
              prepend-icon="mdi-content-save"
              @click="saveConfig"
            >
              保存
            </v-btn>
            <v-spacer />
            <v-btn
              variant="text"
              prepend-icon="mdi-restore"
              @click="resetDefaults"
            >
              恢复默认
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
  providers: {
    deepseek: {
      enabled: true, name: 'DeepSeek', apiKey: '',
      endpoint: 'https://api.deepseek.com/user/balance',
      authType: 'bearer', headerName: '', headerPrefix: '', query: '',
      valuePath: 'balance_infos', valueField: 'total_balance', currency: 'CNY',
      sumField: '', unit: 'CNY'
    },
    kimi: {
      enabled: true, name: 'Kimi', apiKey: '',
      endpoint: 'https://api.moonshot.cn/v1/users/me/balance',
      authType: 'bearer', headerName: '', headerPrefix: '', query: '',
      valuePath: 'data.available_balance', valueField: '', currency: '',
      sumField: '', unit: 'CNY'
    },
    chatgpt: {
      enabled: true, name: 'ChatGPT', apiKey: '',
      endpoint: 'https://api.openai.com/v1/organization/costs',
      authType: 'bearer', headerName: '', headerPrefix: '',
      query: 'start_time={monthStart}&bucket_width=1d&limit=31',
      valuePath: '', valueField: '', currency: '',
      sumField: 'amount.value', unit: 'USD'
    },
    claude: {
      enabled: true, name: 'Claude', apiKey: '',
      endpoint: 'https://api.anthropic.com/v1/organizations/cost_report',
      authType: 'x-api-key', headerName: '', headerPrefix: '',
      query: 'starting_at={monthStartISO}&ending_at={nowISO}&bucket_width=1d',
      valuePath: '', valueField: '', currency: '',
      sumField: 'amount', unit: 'USD'
    },
    custom: {
      enabled: true, name: 'Custom', apiKey: '',
      endpoint: '', authType: 'bearer', headerName: 'Authorization', headerPrefix: 'Bearer ', query: '',
      valuePath: '', valueField: '', currency: '',
      sumField: '', unit: ''
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
      authTypes: [
        { title: 'Bearer', value: 'bearer' },
        { title: 'x-api-key', value: 'x-api-key' },
        { title: '自定义 Header', value: 'custom' }
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
    async saveConfig() {
      const fd = this.getFd();
      if (!fd || !fd.setConfig) {
        alert('找不到保存接口：' + (fd ? '缺少 setConfig' : '$fd 未定义'));
        return;
      }
      try {
        await fd.setConfig(this.modelValue.config);
        if (fd.showSnackbarMessage) {
          fd.showSnackbarMessage('success', '配置已保存');
        }
      } catch (e) {
        alert('保存失败: ' + (e && e.message ? e.message : String(e)));
      }
    },
    resetDefaults() {
      if (!this.modelValue.config) {
        this.modelValue.config = {};
      }
      const defaults = normalizeConfig({});
      Object.keys(defaults).forEach((k) => {
        this.modelValue.config[k] = defaults[k];
      });
      this.saveConfig();
    }
  }
};
</script>

<style scoped></style>
