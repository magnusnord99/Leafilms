'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type ImageSubcategory = { id: string; slug: string; label: string }
export type ImageCategory = { id: string; slug: string; label: string; subcategories: ImageSubcategory[] }

type Row = { id: string; slug: string; label: string; parent_id: string | null; sort_order: number }

function slugify(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'kategori'
}

export function useImageCategories() {
  const [categories, setCategories] = useState<ImageCategory[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from('image_categories')
      .select('id, slug, label, parent_id, sort_order')
      .order('sort_order')

    if (error) {
      console.error('Error fetching image categories:', error)
      setLoading(false)
      return
    }

    const rows = (data || []) as Row[]
    const top = rows.filter(r => !r.parent_id)
    setCategories(top.map(c => ({
      id: c.id,
      slug: c.slug,
      label: c.label,
      subcategories: rows
        .filter(r => r.parent_id === c.id)
        .map(s => ({ id: s.id, slug: s.slug, label: s.label })),
    })))
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  function uniqueSlug(label: string, taken: string[]): string {
    const base = slugify(label)
    let slug = base
    let i = 1
    while (taken.includes(slug)) slug = `${base}-${++i}`
    return slug
  }

  async function createCategory(label: string) {
    const slug = uniqueSlug(label, categories.map(c => c.slug))
    const { error } = await supabase
      .from('image_categories')
      .insert({ slug, label, sort_order: categories.length })
    if (error) throw error
    await refresh()
  }

  async function renameCategory(id: string, label: string) {
    const { error } = await supabase.from('image_categories').update({ label }).eq('id', id)
    if (error) throw error
    await refresh()
  }

  async function createSubcategory(parent: ImageCategory, label: string) {
    const slug = uniqueSlug(label, parent.subcategories.map(s => s.slug))
    const { error } = await supabase
      .from('image_categories')
      .insert({ slug, label, parent_id: parent.id, sort_order: parent.subcategories.length })
    if (error) throw error
    await refresh()
  }

  async function renameSubcategory(id: string, label: string) {
    const { error } = await supabase.from('image_categories').update({ label }).eq('id', id)
    if (error) throw error
    await refresh()
  }

  async function deleteCategory(cat: ImageCategory) {
    if (cat.subcategories.length > 0) {
      throw new Error('Slett underkategoriene først')
    }
    const { count } = await supabase
      .from('images')
      .select('id', { count: 'exact', head: true })
      .eq('category', cat.slug)
    if ((count || 0) > 0) {
      throw new Error(`${count} bilde${count === 1 ? '' : 'r'} bruker denne kategorien`)
    }
    const { error } = await supabase.from('image_categories').delete().eq('id', cat.id)
    if (error) throw error
    await refresh()
  }

  async function deleteSubcategory(cat: ImageCategory, sub: ImageSubcategory) {
    const fullSlug = `${cat.slug}/${sub.slug}`
    const { count } = await supabase
      .from('images')
      .select('id', { count: 'exact', head: true })
      .eq('subcategory', fullSlug)
    if ((count || 0) > 0) {
      throw new Error(`${count} bilde${count === 1 ? '' : 'r'} bruker denne underkategorien`)
    }
    const { error } = await supabase.from('image_categories').delete().eq('id', sub.id)
    if (error) throw error
    await refresh()
  }

  return {
    categories,
    loading,
    refresh,
    createCategory,
    renameCategory,
    createSubcategory,
    renameSubcategory,
    deleteCategory,
    deleteSubcategory,
  }
}
