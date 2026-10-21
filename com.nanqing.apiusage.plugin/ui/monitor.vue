<template>
  <v-container class="pa-3">
    <v-row dense>
      <v-col cols="12">
        <v-select
          v-model="form.provider"
          :items="providers"
          item-title="label"
          item-value="value"
          label="API 提供商"
          density="compact"
          variant="outlined"
          hide-details
          @update:model-value="onProviderChange"
        />
      </v-col>

      <v-col cols="12">
        <v-text-field
          v-model="form.label"
          label="显示名称"
          density="compact"
          variant="outlined"
          hide-details
          @update:model-value="sync"
        />
      </v-col>

      <v-col cols="12">
        <div class="text-caption text-medium-emphasis">
          设备字体不含中文字形，标题中的中文会显示成方框；名称请尽量使用英文/数字（全局设置里可关闭该限制）。
        </div>
      </v-col>

    </v-row>
  </v-container>
</template>

<script>
const BRAND_COLORS = {
  deepseek: '#4D6BFA',
  kimi: '#00B2FF',
  chatgpt: '#10A37F',
  claude: '#D97757',
  custom: '#424242'
};

const PRESETS = {
  deepseek: { label: 'DeepSeek' },
  kimi: { label: 'Kimi' },
  chatgpt: { label: 'ChatGPT' },
  claude: { label: 'Claude' },
  custom: { label: 'Custom' }
};

export default {
  name: 'ApiUsageKeyConfig',
  props: {
    modelValue: {
      type: Object,
      required: true
    }
  },
  data() {
    return {
      providers: [
        { label: 'DeepSeek', value: 'deepseek' },
        { label: 'Kimi', value: 'kimi' },
        { label: 'ChatGPT', value: 'chatgpt' },
        { label: 'Claude', value: 'claude' },
        { label: 'Custom', value: 'custom' }
      ],
      form: {
        provider: 'deepseek',
        label: 'DeepSeek'
      }
    };
  },
  mounted() {
    this.load();
  },
  methods: {
    load() {
      if (!this.modelValue.data) {
        this.modelValue.data = {};
      }
      const d = this.modelValue.data;
      const provider = PRESETS[d.provider] ? d.provider : 'deepseek';
      this.form = {
        provider,
        label: d.label || PRESETS[provider].label
      };
      if (this.modelValue.style && d.colorInitialized !== provider) {
        this.modelValue.style.bgColor = BRAND_COLORS[provider] || '#424242';
        d.colorInitialized = provider;
      }
      this.modelValue.data.provider = this.form.provider;
      this.modelValue.data.label = this.form.label;
    },
    sync() {
      if (!this.modelValue.data) {
        this.modelValue.data = {};
      }
      this.modelValue.data.provider = this.form.provider;
      this.modelValue.data.label = this.form.label;
    },
    onProviderChange(value) {
      const preset = PRESETS[value] || PRESETS.custom;
      this.form.provider = value;
      this.form.label = preset.label;
      if (this.modelValue.style) {
        this.modelValue.style.bgColor = BRAND_COLORS[value] || '#424242';
        if (this.modelValue.data) this.modelValue.data.colorInitialized = value;
      }
      this.sync();
    }
  }
};
</script>

<style scoped></style>
