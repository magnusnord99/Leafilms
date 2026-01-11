'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { Image } from '@/lib/types'
import { supabase } from '@/lib/supabase'

type ImageGalleryProps = {
  images: Image[]
  editMode: boolean
  onImageClick?: () => void
}

export function ImageGallery({ images, editMode, onImageClick }: ImageGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const galleryRef = useRef<HTMLDivElement>(null)
  const [imagesToShow, setImagesToShow] = useState(3) // Antall bilder som vises samtidig
  
  // Detekter skjermstørrelse og sett imagesToShow
  useEffect(() => {
    const checkScreenSize = () => {
      // md breakpoint i Tailwind er 768px
      const isMobile = window.innerWidth < 768
      setImagesToShow(isMobile ? 1 : 3)
    }
    
    checkScreenSize()
    window.addEventListener('resize', checkScreenSize)
    
    return () => {
      window.removeEventListener('resize', checkScreenSize)
    }
  }, [])
  
  // Memoize image IDs string for stable dependency
  const imageIdsString = useMemo(() => images.map(img => img.id).join(','), [images])
  
  // Reset currentIndex når bildene endres eller imagesToShow endres
  useEffect(() => {
    console.log('[ImageGallery] Images changed, resetting currentIndex. Image IDs:', imageIdsString)
    setCurrentIndex(0)
  }, [imageIdsString, imagesToShow])
  
  // Log når bildene endres
  useEffect(() => {
    console.log('[ImageGallery] Rendering with images:', images.map((img, idx) => ({ 
      index: idx, 
      id: img.id, 
      title: img.title,
      file_path: img.file_path?.substring(0, 50) + '...'
    })))
  }, [images])

  if (images.length === 0) {
    return (
      <div className="mt-12">
        {editMode ? (
          <button
            onClick={onImageClick}
            className="w-full h-64 bg-gray-300/50 border-2 border-dashed border-gray-400 rounded-lg flex items-center justify-center hover:bg-gray-400/50 transition cursor-pointer"
          >
            <span className="text-dark">+ Legg til bilder i galleriet</span>
          </button>
        ) : null}
      </div>
    )
  }

  const getVisibleImages = () => {
    const visible: Image[] = []
    for (let i = 0; i < imagesToShow; i++) {
      const index = (currentIndex + i) % images.length
      visible.push(images[index])
    }
    return visible
  }

  const visibleImages = getVisibleImages()

  const maxIndex = Math.max(0, images.length - imagesToShow)

  // Automatisk scrolling er fjernet - bruk pilene for å bla gjennom bildene

  const goToPrevious = () => {
    setCurrentIndex((prev) => prev <= 0 ? maxIndex : prev - 1)
  }

  const goToNext = () => {
    setCurrentIndex((prev) => prev >= maxIndex ? 0 : prev + 1)
  }

  // Beregn translateX-verdi basert på currentIndex
  // Bildebredde = (100% - (imagesToShow - 1) * gap) / imagesToShow
  // For å flytte ett bilde: bildebredde + gap
  const gapRem = 1 // gap-4 = 1rem
  const totalGaps = imagesToShow - 1
  // Formel: -currentIndex * ((100% - totalGaps*gap) / imagesToShow + gap)
  const translateX = `calc(-${currentIndex} * ((100% - ${totalGaps * gapRem}rem) / ${imagesToShow} + ${gapRem}rem))`

  return (
    <div ref={galleryRef} className="mt-12 relative">
      {/* Gallery Container */}
      <div className="relative w-full overflow-hidden rounded-lg">
        {/* Inner container som flytter seg */}
        <div
          className="flex gap-4 transition-transform duration-500 ease-in-out"
          style={{ transform: `translateX(${translateX})` }}
        >
          {images.map((image, idx) => {
            const imageUrl = image?.file_path
              ? supabase.storage.from('assets').getPublicUrl(image.file_path).data.publicUrl
              : null
            // Legg til cache-busting basert på image ID
            const cacheBustUrl = imageUrl ? `${imageUrl}?v=${image.id}` : null

            return (
              <div
                key={`${image.id}-${idx}`}
                className="relative aspect-[4/5] rounded-lg overflow-hidden bg-gray-200 flex-shrink-0"
                style={{ 
                  width: `calc((100% - ${(imagesToShow - 1) * 1}rem) / ${imagesToShow})`,
                  minHeight: imagesToShow === 1 ? '400px' : 'auto' // Minimum høyde på mobil
                }}
              >
                {cacheBustUrl ? (
                  <img
                    key={`img-${image.id}-${idx}`}
                    src={cacheBustUrl}
                    alt={image?.title || `Bilde ${idx + 1}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-gray-400">Ingen bilde-URL</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Edit overlay */}
        {editMode && (
          <button
            onClick={onImageClick}
            className="absolute inset-0 bg-black/0 hover:bg-black/10 transition flex items-center justify-center rounded-lg"
          >
            <span className="text-white bg-black/50 px-4 py-2 rounded opacity-0 hover:opacity-100 transition">
              Endre bilder
            </span>
          </button>
        )}

        {/* Navigation Arrows - alltid synlig når det er flere bilder enn som vises */}
        {images.length > imagesToShow && (
          <>
            <button
              onClick={goToPrevious}
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 bg-black/60 hover:bg-black/80 text-white rounded-full p-3 transition z-10 shadow-lg"
              aria-label="Forrige bilde"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={goToNext}
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 bg-black/60 hover:bg-black/80 text-white rounded-full p-3 transition z-10 shadow-lg"
              aria-label="Neste bilde"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        )}

        {/* Image Indicators */}
        {images.length > imagesToShow && (
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex gap-2 z-10">
            {Array.from({ length: maxIndex + 1 }).map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                className={`w-2 h-2 rounded-full transition ${
                  currentIndex === idx ? 'bg-dark' : 'bg-dark/30'
                }`}
                aria-label={`Gå til posisjon ${idx + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

