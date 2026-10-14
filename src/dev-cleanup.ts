if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then(async registrations => {
    const stale = registrations.filter(registration =>
      [registration.active, registration.waiting, registration.installing]
        .some(worker => worker?.scriptURL.endsWith('/sw.js')),
    )
    if (stale.length === 0) return
    await Promise.all(stale.map(registration => registration.unregister()))
    const keys = await caches.keys()
    await Promise.all(keys.filter(key => key.startsWith('lifeos-shell-')).map(key => caches.delete(key)))
    window.location.reload()
  }).catch(error => console.error('Could not refresh the local LifeOS app cache', error))
}
