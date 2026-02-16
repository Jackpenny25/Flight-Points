import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Settings, Play, Save } from 'lucide-react';
import { PresentationMode } from './PresentationMode';
import { toast } from 'sonner';

interface PresentationSettings {
  slideDuration: number; // in seconds
  dataRefreshInterval: number; // in seconds
  customText: {
    squadronName: string;
    headerSubtitle: string;
  };
  colors: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
  };
}

const DEFAULT_SETTINGS: PresentationSettings = {
  slideDuration: 10,
  dataRefreshInterval: 30,
  customText: {
    squadronName: '2427 (Biggin Hill) Squadron',
    headerSubtitle: 'RAF Air Cadets',
  },
  colors: {
    primaryColor: '#004B87',
    secondaryColor: '#5b9bd5',
    accentColor: '#dceaf6',
  },
};

export function PresentationEditor() {
  const [settings, setSettings] = useState<PresentationSettings>(DEFAULT_SETTINGS);
  const [showPreview, setShowPreview] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Load settings from localStorage
  useEffect(() => {
    const savedSettings = localStorage.getItem('presentationSettings');
    if (savedSettings) {
      try {
        setSettings(JSON.parse(savedSettings));
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    }
  }, []);

  const saveSettings = () => {
    localStorage.setItem('presentationSettings', JSON.stringify(settings));
    setHasChanges(false);
    toast.success('Presentation settings saved successfully');
  };

  const resetToDefaults = () => {
    setSettings(DEFAULT_SETTINGS);
    setHasChanges(true);
    toast.info('Settings reset to defaults');
  };

  const updateSetting = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const updateNestedSetting = (parent: string, key: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      [parent]: { ...(prev as any)[parent], [key]: value }
    }));
    setHasChanges(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Presentation Mode Settings</h2>
          <p className="text-muted-foreground">Configure and preview your presentation slideshow</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowPreview(true)} variant="outline">
            <Play className="mr-2 h-4 w-4" />
            Preview Presentation
          </Button>
          <Button onClick={saveSettings} disabled={!hasChanges}>
            <Save className="mr-2 h-4 w-4" />
            Save Changes
          </Button>
        </div>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="branding">Branding</TabsTrigger>
          <TabsTrigger value="colors">Colors</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Timing Settings</CardTitle>
              <CardDescription>Control how long each slide displays</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="slideDuration">Slide Duration (seconds)</Label>
                <Input
                  id="slideDuration"
                  type="number"
                  min={5}
                  max={60}
                  value={settings.slideDuration}
                  onChange={(e) => updateSetting('slideDuration', parseInt(e.target.value))}
                />
                <p className="text-sm text-muted-foreground">
                  Each slide will display for {settings.slideDuration} seconds before advancing
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dataRefresh">Data Refresh Interval (seconds)</Label>
                <Input
                  id="dataRefresh"
                  type="number"
                  min={10}
                  max={300}
                  value={settings.dataRefreshInterval}
                  onChange={(e) => updateSetting('dataRefreshInterval', parseInt(e.target.value))}
                />
                <p className="text-sm text-muted-foreground">
                  Leaderboard data will refresh every {settings.dataRefreshInterval} seconds
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="branding" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Squadron Branding</CardTitle>
              <CardDescription>Customize the text that appears on slides</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="squadronName">Squadron Name</Label>
                <Input
                  id="squadronName"
                  value={settings.customText.squadronName}
                  onChange={(e) => updateNestedSetting('customText', 'squadronName', e.target.value)}
                  placeholder="e.g., 2427 (Biggin Hill) Squadron"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="headerSubtitle">Header Subtitle</Label>
                <Input
                  id="headerSubtitle"
                  value={settings.customText.headerSubtitle}
                  onChange={(e) => updateNestedSetting('customText', 'headerSubtitle', e.target.value)}
                  placeholder="e.g., RAF Air Cadets"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="colors" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Color Scheme</CardTitle>
              <CardDescription>Customize the presentation colors</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="primaryColor">Primary Color</Label>
                  <div className="flex gap-2 items-center">
                    <Input
                      id="primaryColor"
                      type="color"
                      value={settings.colors.primaryColor}
                      onChange={(e) => updateNestedSetting('colors', 'primaryColor', e.target.value)}
                      className="w-16 h-10"
                    />
                    <Input
                      type="text"
                      value={settings.colors.primaryColor}
                      onChange={(e) => updateNestedSetting('colors', 'primaryColor', e.target.value)}
                      className="flex-1"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="secondaryColor">Secondary Color</Label>
                  <div className="flex gap-2 items-center">
                    <Input
                      id="secondaryColor"
                      type="color"
                      value={settings.colors.secondaryColor}
                      onChange={(e) => updateNestedSetting('colors', 'secondaryColor', e.target.value)}
                      className="w-16 h-10"
                    />
                    <Input
                      type="text"
                      value={settings.colors.secondaryColor}
                      onChange={(e) => updateNestedSetting('colors', 'secondaryColor', e.target.value)}
                      className="flex-1"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="accentColor">Accent Color</Label>
                  <div className="flex gap-2 items-center">
                    <Input
                      id="accentColor"
                      type="color"
                      value={settings.colors.accentColor}
                      onChange={(e) => updateNestedSetting('colors', 'accentColor', e.target.value)}
                      className="w-16 h-10"
                    />
                    <Input
                      type="text"
                      value={settings.colors.accentColor}
                      onChange={(e) => updateNestedSetting('colors', 'accentColor', e.target.value)}
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>

              <Button onClick={resetToDefaults} variant="outline" className="w-full">
                Reset to Default Colors
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {showPreview && (
        <PresentationMode 
          onClose={() => setShowPreview(false)} 
          settings={settings}
        />
      )}
    </div>
  );
}
