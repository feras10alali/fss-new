<script>
  import logo from '$lib/images/OBlogo.webp'
  import Tlogo from '$lib/images/Tlogo.webp'
</script>
<nav class="fixed top-0 w-full bg-black/80 backdrop-blur-lg border-b border-gray-800 z-50">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex justify-between items-center h-16">
      <div class="flex items-center space-x-3">
        <!-- Logo placeholder - you can replace with your webp logo -->
        <img src={logo} alt="FSS Logo" class="w-16" />
    <img src={Tlogo} alt="FSS text Logo" class="w-16" />
      </div>
      
      <div class="hidden md:flex items-center space-x-8">
        <a href="#features" class="text-gray-300 hover:text-white transition-colors">Features</a>
        <a href="#pricing" class="text-gray-300 hover:text-white transition-colors">Pricing</a>
        <a href="/about" class="text-gray-300 hover:text-white transition-colors">About</a>
        <a href="/login" class="bg-white text-black px-6 py-2 rounded-lg font-medium hover:bg-gray-100 transition-colors inline-block text-center">
      Sign In
    </a>
      </div>
    </div>
  </div>
</nav>