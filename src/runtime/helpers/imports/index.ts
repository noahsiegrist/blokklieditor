import { chunks, chunkMapping } from '#blokkli-build/imports'
import type { Component } from 'vue'
import { defineAsyncComponent } from '#imports'
import type {
  ValidFieldListTypes,
  ValidProviderTypes,
} from '#blokkli-build/generated-types'

// One wrapper per key: a wrapper per block instance would call the loader and
// hydrate asynchronously once for every instance instead of once per bundle.
const asyncComponents = new Map<string, Component>()

function asyncComponentFor(
  key: string,
  loader: () => Promise<Component | { default: Component }>,
): Component {
  let component = asyncComponents.get(key)
  if (!component) {
    component = defineAsyncComponent(loader)
    asyncComponents.set(key, component)
  }
  return component
}

function objectOrImport(
  key: string,
): Component | Promise<() => Component> | undefined {
  const chunkName = chunkMapping[key]
  if (!chunkName) {
    return
  }

  const chunkEntry = chunks[chunkName]
  if (!chunkEntry) {
    return
  }

  if (typeof chunkEntry === 'function') {
    return asyncComponentFor(key, () =>
      chunkEntry().then((group) => {
        const item = group[key]
        if (item && 'loadComponent' in item) {
          return item.loadComponent()
        }
        return item
      }),
    )
  }

  const item = chunkEntry[key]
  if (item && 'loadComponent' in item) {
    return asyncComponentFor(key, () => item.loadComponent())
  }

  return item
}

type GetComponentContext = {
  fieldListType?: ValidFieldListTypes
  parentBundle?: string
  providerType?: ValidProviderTypes
}

export function getComponent(
  type: 'block' | 'fragment',
  bundleOrFragmentName: string,
  context: GetComponentContext,
  allComponents?: Record<string, Component> | null,
): any {
  if (context.providerType) {
    const key = `${type}:${bundleOrFragmentName}__t:${context.providerType}`
    if (allComponents && allComponents[key]) {
      return allComponents[key]
    }
    if (chunkMapping[key]) {
      return objectOrImport(key)
    }
  }

  if (context.fieldListType) {
    const key = `${type}:${bundleOrFragmentName}__f:${context.fieldListType}`
    if (allComponents && allComponents[key]) {
      return allComponents[key]
    }
    if (chunkMapping[key]) {
      return objectOrImport(key)
    }
  }

  if (context.parentBundle) {
    const key = `${type}:${bundleOrFragmentName}__p:${context.parentBundle}`
    if (allComponents && allComponents[key]) {
      return allComponents[key]
    }
    if (chunkMapping[key]) {
      return objectOrImport(key)
    }
  }

  const key = `${type}:${bundleOrFragmentName}`
  if (allComponents && allComponents[key]) {
    return allComponents[key]
  }
  return objectOrImport(key)
}
