<template>
  <slot :mutated-entity="mutatedEntity" />
</template>

<script lang="ts" setup generic="T">
import {
  ref,
  reactive,
  computed,
  provide,
  onMounted,
  onBeforeUnmount,
  useRouter,
  useAsyncData,
} from '#imports'
import type { MutatedOptions } from '#blokkli/editor/types/state'
import '#blokkli-build/styles.css'
import getAdapter from '#blokkli-build/edit-adapter'
import {
  INJECT_EDIT_CONTEXT,
  INJECT_IS_PREVIEW,
  INJECT_MUTATED_FIELDS_MAP,
} from '#blokkli/helpers/injections'
import broadcastProvider from '#blokkli/editor/providers/broadcast'
import { getFieldKey } from '#blokkli/helpers'
import { intersects } from '#blokkli/editor/helpers/geometry'
import { isMessageFrom } from '#blokkli/editor/helpers/message'
import type { AdapterContext } from '../../editor/adapter'
import {
  eventBus,
  frameEventBus,
  type UpdatePreviewStateEvent,
} from '#blokkli/editor/events'
import definitionProvider from '#blokkli/editor/providers/definition'
import { addElementClasses } from '#blokkli/editor/composables'
import type { UpdateBlockOptionEvent } from '../features/options/types'
import type { MutatedField } from '../types/state'
import type { ValidProviderTypes } from '#blokkli-build/generated-types'

const props = defineProps<{
  entity?: T
  entityType: string
  entityUuid: string
  entityBundle: string
  language: string
  providerType: ValidProviderTypes
}>()

defineSlots<{
  default(props: { mutatedEntity: T }): any
}>()

const emit = defineEmits<{
  (e: 'ready'): void
}>()

const context = computed<AdapterContext>(() => {
  return {
    entityType: props.entityType,
    entityBundle: props.entityBundle,
    entityUuid: props.entityUuid,
    language: props.language,
  }
})
const interfaceLanguage = computed(() => context.value.language)
const adapter = await getAdapter(context)
const router = useRouter()
const broadcast = broadcastProvider()
const definitions = definitionProvider(props.providerType, interfaceLanguage)

let timeout: any = null
let lastChanged: string | null = null
const mutatedFieldsMap = reactive<Record<string, MutatedField | undefined>>({})
const mutatedOptions = reactive<MutatedOptions>({})
const mutatedEntityFromState = ref<T | null>(null)

const mutatedEntity = computed(
  () => mutatedEntityFromState.value || props.entity,
)

const { data, refresh, error } = await useAsyncData(() =>
  adapter.loadState().then((v) => adapter.mapState(v)),
)

function onUpdatePreviewState(e: UpdatePreviewStateEvent) {
  const existingKeys = Object.keys(mutatedFieldsMap)
  const newKeys = new Set<string>()

  for (let i = 0; i < e.fields.length; i++) {
    const field = e.fields[i]!
    const key = getFieldKey(field.entityUuid, field.name)
    mutatedFieldsMap[key] = field
    newKeys.add(key)
  }

  for (let i = 0; i < existingKeys.length; i++) {
    const key = existingKeys[i]!
    if (!newKeys.has(key)) {
      mutatedFieldsMap[key] = undefined
    }
  }
  mutatedEntityFromState.value = e.mutatedEntity
}

const updateState = () => {
  const fields = data.value?.mutatedState?.fields || []
  onUpdatePreviewState({
    fields,
    mutatedEntity: data.value?.mutatedEntity || {},
  })

  const options =
    mutatedOptions.value || data.value?.mutatedState?.mutatedOptions || {}
  const optionKeys = Object.keys(options)

  for (let i = 0; i < optionKeys.length; i++) {
    const key = optionKeys[i]
    if (key) {
      const newOptions = options[key]
      const existing = mutatedOptions[key]
      if (
        !existing ||
        JSON.stringify(existing) !== JSON.stringify(newOptions)
      ) {
        mutatedOptions[key] = newOptions
      }
    }
  }
}

updateState()

const isPreview = computed(() => !error.value)

provide(INJECT_MUTATED_FIELDS_MAP, mutatedFieldsMap)
provide(INJECT_IS_PREVIEW, isPreview)
provide(INJECT_EDIT_CONTEXT, {
  mutatedOptions,
  eventBus,
  definitions,
  selectedUuids: computed<string[]>(() => {
    return []
  }),
})

/**
 * Listen to window messages and emit the matching frameEventBus event.
 *
 * Only the editor's messages are accepted: they change what the preview
 * renders. The editor is the parent window, on the same origin.
 */
function onMessage(e: MessageEvent) {
  if (!isMessageFrom(e, window.parent, window.location.origin)) {
    return
  }
  if (
    e.data &&
    typeof e.data === 'object' &&
    e.data.name &&
    typeof e.data.name === 'string' &&
    e.data.name.startsWith('blokkli__')
  ) {
    const name = e.data.name.replace('blokkli__', '')
    const data = e.data.data
    frameEventBus.emit(name, data)
  }
}

const onMouseDown = () => {
  broadcast.emit('previewFocused')
}

// A preview whose adapter can't tell when the state changed reloads it every
// 5 s instead.
const POLL_DELAYS = [1000, 2000, 5000]
const FALLBACK_POLL_DELAY = 5000
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel']

let pollStep = 0

function getPollDelay() {
  if (!adapter.getLastChanged) {
    return FALLBACK_POLL_DELAY
  }
  return POLL_DELAYS[Math.min(pollStep, POLL_DELAYS.length - 1)]!
}

/**
 * Schedule the next check of the last changed date.
 *
 * Nothing is scheduled while the tab is hidden: onVisibilityChange resumes.
 */
function scheduleCheck(delay = getPollDelay()) {
  clearTimeout(timeout)

  // State loading has failed, so we can return here; no need to poll.
  if (!isPreview.value || document.hidden) {
    return
  }

  timeout = setTimeout(checkChangedDate, delay)
}

/**
 * Check the last changed date and update the mutated state if there is an
 * update. Poll less often for as long as nothing changes.
 */
async function checkChangedDate() {
  const changed = adapter.getLastChanged
    ? await adapter.getLastChanged()
    : new Date().toISOString()
  if (changed) {
    if (lastChanged !== null && lastChanged !== changed) {
      pollStep = 0
      await refresh()
      updateState()
    } else {
      pollStep++
    }
    lastChanged = changed
    scheduleCheck()
  }
}

function onVisibilityChange() {
  if (document.hidden) {
    clearTimeout(timeout)
  } else {
    pollStep = 0
    scheduleCheck(0)
  }
}

function onActivity() {
  if (pollStep > 0) {
    pollStep = 0
    scheduleCheck()
  }
}

const onWheel = (e: WheelEvent) => {
  if (e.ctrlKey) {
    e.preventDefault()
  }
}

const isInIframe = () => window.parent !== window

const onFocusItem = (uuid: string) => {
  const el = document.querySelector(`[data-bk-uuid="${uuid}"]`)
  if (el) {
    const elRect = el.getBoundingClientRect()
    if (
      !intersects(elRect, {
        x: 0,
        y: 0,
        width: window.innerWidth,
        height: window.innerHeight,
      })
    ) {
      el.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'center',
      })
    }
  }
}
const onUpdateOption = (option: UpdateBlockOptionEvent) => {
  const { uuid, key, value } = option

  if (!mutatedOptions[uuid]) {
    mutatedOptions[uuid] = {}
  }

  mutatedOptions[uuid][key] = value
}

addElementClasses(document.body, 'bk-body-preview')
addElementClasses(document.documentElement, 'bk-html-preview')

onMounted(() => {
  if (isInIframe()) {
    frameEventBus.on('updatePreviewState', onUpdatePreviewState)
    frameEventBus.on('focus', onFocusItem)
    frameEventBus.on('updateOption', onUpdateOption)
    // We are a preview inside the iframe of the main editing app.
    // In this case updated state is passed in via postMessage from the main
    // editing app.
    window.addEventListener('message', onMessage)
    window.addEventListener('wheel', onWheel, { passive: false })
    document.documentElement.addEventListener('mousedown', onMouseDown)

    // Prevent navigating away from the preview when clicking Nuxt links.
    router.push = () => Promise.resolve()
    router.replace = () => Promise.resolve()
  } else {
    // We are a standalone page in preview mode. Setup polling for changes.
    scheduleCheck()
    document.addEventListener('visibilitychange', onVisibilityChange)
    ACTIVITY_EVENTS.forEach((name) => {
      document.addEventListener(name, onActivity, { passive: true })
    })
  }
  emit('ready')
})

onBeforeUnmount(() => {
  clearTimeout(timeout)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  ACTIVITY_EVENTS.forEach((name) => {
    document.removeEventListener(name, onActivity)
  })
  window.removeEventListener('wheel', onWheel)
  window.removeEventListener('message', onMessage)
  document.documentElement.removeEventListener('mousedown', onMouseDown)
  frameEventBus.off('updatePreviewState', onUpdatePreviewState)
  frameEventBus.off('focus', onFocusItem)
  frameEventBus.off('updateOption', onUpdateOption)
})
</script>

<style lang="postcss">
.bk-body-preview {
  @apply overflow-hidden;
  @apply overflow-y-auto;
}
</style>
