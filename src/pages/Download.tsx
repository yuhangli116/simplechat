import React, { useState, useEffect } from 'react';
import { 
  Download as DownloadIcon, 
  Smartphone, 
  Monitor, 
  Apple, 
  Command, 
  Terminal,
  Check,
  QrCode
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/supabase';

type AppVersion = Database['public']['Tables']['app_versions']['Row'];

const Download = () => {
  const [activePlatform, setActivePlatform] = useState<'desktop' | 'mobile'>('desktop');
  const [versions, setVersions] = useState<AppVersion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchVersions = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('app_versions')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (error) {
          console.error('Error fetching versions:', error);
        } else {
          setVersions(data || []);
        }
      } catch (err) {
        console.error('Unexpected error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchVersions();
  }, []);

  // Mock Fallback
  const mockVersions: AppVersion[] = [
    { id: 'mock-win', platform: 'windows', version: 'v1.2.0', size: '85 MB', download_url: '#', release_notes: null, force_update: false, created_at: '', build_number: 120 },
    { id: 'mock-mac', platform: 'mac', version: 'v1.2.0', size: '92 MB', download_url: '#', release_notes: null, force_update: false, created_at: '', build_number: 120 },
    { id: 'mock-linux', platform: 'linux', version: 'v1.2.0', size: '78 MB', download_url: '#', release_notes: null, force_update: false, created_at: '', build_number: 120 },
    { id: 'mock-ios', platform: 'ios', version: 'v1.0.5', size: 'App Store', download_url: '#', release_notes: null, force_update: false, created_at: '', build_number: 105 },
    { id: 'mock-android', platform: 'android', version: 'v1.0.5', size: 'Google Play', download_url: '#', release_notes: null, force_update: false, created_at: '', build_number: 105 },
  ];

  const displayVersions = versions.length > 0 ? versions : mockVersions;

  const getLatestVersion = (platform: string) => {
    return displayVersions.find(v => v.platform === platform);
  };

  const platforms = {
    desktop: [
      { id: 'win', name: 'Windows', icon: <Monitor className="w-6 h-6" />, type: 'installer', data: getLatestVersion('windows') },
      { id: 'mac', name: 'macOS', icon: <Command className="w-6 h-6" />, type: 'dmg', data: getLatestVersion('mac') },
      { id: 'linux', name: 'Linux', icon: <Terminal className="w-6 h-6" />, type: 'AppImage', data: getLatestVersion('linux') },
    ],
    mobile: [
      { id: 'ios', name: 'iOS', icon: <Apple className="w-6 h-6" />, store: 'App Store', data: getLatestVersion('ios') },
      { id: 'android', name: 'Android', icon: <Smartphone className="w-6 h-6" />, store: 'Google Play', data: getLatestVersion('android') },
    ]
  };

  const features = [
    '多端实时同步，随时随地创作',
    '离线模式支持，无网也能写',
    '本地数据加密，保障隐私安全',
    '专注模式，沉浸式写作体验'
  ];

  return (
    <div className="flex-1 h-full bg-white flex flex-col overflow-y-auto">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-gray-900 to-black text-white py-20 px-8 text-center relative overflow-hidden">
        <div className="relative z-10 max-w-4xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight">
            随时随地，捕捉灵感
          </h1>
          <p className="text-lg text-gray-400 mb-10 max-w-2xl mx-auto">
            下载简单写作客户端，体验更流畅的本地创作环境。支持 Windows, macOS, Linux 以及 iOS, Android 全平台覆盖。
          </p>
          
          {/* Platform Toggle */}
          <div className="inline-flex bg-white/10 p-1 rounded-full mb-12 backdrop-blur-sm">
            <button
              onClick={() => setActivePlatform('desktop')}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                activePlatform === 'desktop' ? 'bg-white text-black shadow-lg' : 'text-white hover:bg-white/5'
              }`}
            >
              桌面端
            </button>
            <button
              onClick={() => setActivePlatform('mobile')}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                activePlatform === 'mobile' ? 'bg-white text-black shadow-lg' : 'text-white hover:bg-white/5'
              }`}
            >
              移动端
            </button>
          </div>
        </div>
        
        {/* Background Gradients */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] right-[-5%] w-96 h-96 bg-blue-600/20 rounded-full blur-3xl" />
          <div className="absolute bottom-[-10%] left-[-5%] w-96 h-96 bg-purple-600/20 rounded-full blur-3xl" />
        </div>
      </div>

      {/* Downloads Section */}
      <div className="max-w-6xl mx-auto px-8 py-16 w-full">
        {loading ? (
            <div className="text-center py-10 text-gray-500">获取版本信息中...</div>
        ) : activePlatform === 'desktop' ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {platforms.desktop.map(item => (
              <div key={item.id} className="relative overflow-hidden border-2 border-blue-100 rounded-2xl p-8 flex flex-col items-center text-center group hover:shadow-2xl hover:border-blue-400 transition-all duration-300 hover:-translate-y-2 bg-gradient-to-br from-blue-50 via-white to-gray-50 shadow-xl">
                {/* Highlight Effect */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                
                <div className="w-20 h-20 bg-blue-600 text-white rounded-3xl shadow-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  {item.icon}
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">{item.name}</h3>
                <p className="text-md text-blue-600 font-medium mb-6">
                  {item.data ? `${item.data.version} • ${item.data.size}` : '暂无版本'}
                </p>
                <a 
                  href={item.data?.download_url || '#'} 
                  target="_blank"
                  rel="noreferrer"
                  className={`w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 transition-colors flex items-center justify-center shadow-lg hover:shadow-blue-500/50 ${!item.data && 'opacity-50 cursor-not-allowed'}`}
                >
                  <DownloadIcon className="w-5 h-5 mr-2" />
                  立即下载 {item.type}
                </a>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 max-w-4xl mx-auto">
            {platforms.mobile.map(item => (
              <div key={item.id} className="relative overflow-hidden border-2 border-purple-100 rounded-2xl p-8 flex flex-col md:flex-row items-center gap-8 hover:shadow-2xl hover:border-purple-400 transition-all duration-300 hover:-translate-y-2 bg-gradient-to-br from-purple-50 via-white to-gray-50 shadow-xl">
                {/* Highlight Effect */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-purple-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                <div className="flex-1 text-center md:text-left">
                  <div className="w-16 h-16 bg-purple-600 text-white rounded-3xl shadow-lg flex items-center justify-center mb-4 md:mx-0 mx-auto group-hover:scale-110 transition-transform">
                    {item.icon}
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">{item.name}</h3>
                  <p className="text-md text-purple-600 font-medium mb-6">
                    {item.data ? `${item.data.version}` : '敬请期待'}
                  </p>
                  <a 
                    href={item.data?.download_url || '#'}
                    target="_blank"
                    rel="noreferrer"
                    className={`inline-flex items-center justify-center px-6 py-4 bg-purple-600 text-white rounded-xl font-bold text-lg hover:bg-purple-700 transition-colors shadow-lg hover:shadow-purple-500/50 ${!item.data && 'opacity-50 cursor-not-allowed'}`}
                  >
                    <DownloadIcon className="w-5 h-5 mr-2" />
                    前往 {item.store}
                  </a>
                </div>
                {/* QR Code Placeholder */}
                <div className="w-32 h-32 bg-white border-2 border-purple-100 rounded-xl flex items-center justify-center shadow-inner">
                  <QrCode className="w-16 h-16 text-purple-400" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Download;
