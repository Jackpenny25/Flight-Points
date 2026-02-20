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
  enabledSlides: {
    flightPoints: boolean;
    recentActivity: boolean;
    completeLeaderboard: boolean;
  };
  customText: {
    squadronName: string;
    headerSubtitle: string;
  };
  colors: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
  };
  tableScale: number; // Scale multiplier for table sizes (0.5 - 1.5)
  elementColors: {
    tableHeaderBg?: string;
    tableRowAlt?: string;
    textColor?: string;
    recentActivityBg?: string;
  };
  // Individual slide customization
  slideCustomization?: {
    flightPoints?: {
      title?: string;
      leftTableTitle?: string;
      rightTableTitle?: string;
      leftTableScale?: number;
      rightTableScale?: number;
      titleFontSize?: number;
      sectionTitleFontSize?: number;
      tableFontSize?: number;
    };
    recentActivity?: {
      title?: string;
      rowCount?: number;
      tableFontSize?: number;
      titleFontSize?: number;
    };
    completeLeaderboard?: {
      title?: string;
      tableFontSize?: number;
      titleFontSize?: number;
    };
  };
}

const DEFAULT_SETTINGS: PresentationSettings = {
  slideDuration: 10,
  dataRefreshInterval: 30,
  enabledSlides: {
    flightPoints: true,
    recentActivity: true,
    completeLeaderboard: true,
  },
  customText: {
    squadronName: '2427 (Biggin Hill) Squadron',
    headerSubtitle: 'RAF Air Cadets',
  },
  colors: {
    primaryColor: '#004B87',
    secondaryColor: '#5b9bd5',
    accentColor: '#dceaf6',
  },
  tableScale: 1,
  elementColors: {},
  slideCustomization: {
    flightPoints: {
      title: 'Flight points:',
      leftTableTitle: 'Flight point totals:',
      rightTableTitle: 'Who has the most points:',
      leftTableScale: 1,
      rightTableScale: 1,
      titleFontSize: 60,
      sectionTitleFontSize: 40,
      tableFontSize: 24,
    },
    recentActivity: {
      title: 'Who Got Points Recently',
      rowCount: 12,
      tableFontSize: 16,
      titleFontSize: 50,
    },
    completeLeaderboard: {
      title: 'Complete Leaderboard',
      tableFontSize: 16,
      titleFontSize: 50,
    },
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
        const parsed = JSON.parse(savedSettings);
        // Merge with defaults to ensure all properties exist
        setSettings({
          ...DEFAULT_SETTINGS,
          ...parsed,
          enabledSlides: {
            ...DEFAULT_SETTINGS.enabledSlides,
            ...(parsed.enabledSlides || {})
          },
          customText: {
            ...DEFAULT_SETTINGS.customText,
            ...(parsed.customText || {})
          },
          colors: {
            ...DEFAULT_SETTINGS.colors,
            ...(parsed.colors || {})
          },
          elementColors: {
            ...DEFAULT_SETTINGS.elementColors,
            ...(parsed.elementColors || {})
          },
          slideCustomization: {
            flightPoints: { ...DEFAULT_SETTINGS.slideCustomization!.flightPoints, ...(parsed.slideCustomization?.flightPoints || {}) },
            recentActivity: { ...DEFAULT_SETTINGS.slideCustomization!.recentActivity, ...(parsed.slideCustomization?.recentActivity || {}) },
            completeLeaderboard: { ...DEFAULT_SETTINGS.slideCustomization!.completeLeaderboard, ...(parsed.slideCustomization?.completeLeaderboard || {}) },
          },
        });
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

  const updateSlideCustomization = (slide: string, key: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      slideCustomization: {
        ...(prev.slideCustomization || {}),
        [slide]: {
          ...(prev.slideCustomization?.[slide as keyof typeof prev.slideCustomization] || {}),
          [key]: value
        }
      }
    }));
    setHasChanges(true);
  };

  const enabledSlidesCount = Object.values(settings.enabledSlides).filter(Boolean).length;

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
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="slides">Slides</TabsTrigger>
          <TabsTrigger value="individual">Individual</TabsTrigger>
          <TabsTrigger value="styling">Styling</TabsTrigger>
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

        <TabsContent value="slides" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Enabled Slides ({enabledSlidesCount}/3)</CardTitle>
              <CardDescription>Choose which slides to include in the presentation</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="flightPoints">Flight Points Summary</Label>
                  <p className="text-sm text-muted-foreground">Shows flight totals and top cadet/flight side by side</p>
                </div>
                <Switch
                  id="flightPoints"
                  checked={settings.enabledSlides.flightPoints}
                  onCheckedChange={(checked) => updateNestedSetting('enabledSlides', 'flightPoints', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="recentActivity">Recent Points Activity</Label>
                  <p className="text-sm text-muted-foreground">Shows latest point awards with teal background</p>
                </div>
                <Switch
                  id="recentActivity"
                  checked={settings.enabledSlides.recentActivity}
                  onCheckedChange={(checked) => updateNestedSetting('enabledSlides', 'recentActivity', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="completeLeaderboard">Complete Leaderboard</Label>
                  <p className="text-sm text-muted-foreground">Shows all cadets in a full ranking table</p>
                </div>
                <Switch
                  id="completeLeaderboard"
                  checked={settings.enabledSlides.completeLeaderboard}
                  onCheckedChange={(checked) => updateNestedSetting('enabledSlides', 'completeLeaderboard', checked)}
                />
              </div>

              {enabledSlidesCount === 0 && (
                <p className="text-sm text-red-600">⚠️ Warning: You must enable at least one slide</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="styling" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Slide Styling</CardTitle>
              <CardDescription>Customize the appearance of elements in your slides</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="tableScale">Table Size Scale: {(settings.tableScale || 1).toFixed(2)}x</Label>
                <Input
                  id="tableScale"
                  type="range"
                  min={0.5}
                  max={1.5}
                  step={0.05}
                  value={settings.tableScale || 1}
                  onChange={(e) => updateSetting('tableScale', parseFloat(e.target.value))}
                  className="w-full"
                />
                <p className="text-sm text-muted-foreground">
                  Adjust the size of tables and text in the presentation (50% - 150%)
                </p>
              </div>

              <div className="space-y-4 pt-4 border-t">
                <h3 className="font-semibold">Element Colors (Optional Overrides)</h3>
                <p className="text-sm text-muted-foreground">Leave blank to use primary/secondary/accent colors</p>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="tableHeaderBg">Table Header Background</Label>
                    <div className="flex gap-2 items-center">
                      <Input
                        id="tableHeaderBg"
                        type="color"
                        value={settings.elementColors?.tableHeaderBg || settings.colors.secondaryColor}
                        onChange={(e) => updateNestedSetting('elementColors', 'tableHeaderBg', e.target.value)}
                        className="w-16 h-10"
                      />
                      <Input
                        type="text"
                        value={settings.elementColors?.tableHeaderBg || ''}
                        onChange={(e) => updateNestedSetting('elementColors', 'tableHeaderBg', e.target.value)}
                        placeholder="Use secondary color"
                        className="flex-1"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tableRowAlt">Alternate Row Background</Label>
                    <div className="flex gap-2 items-center">
                      <Input
                        id="tableRowAlt"
                        type="color"
                        value={settings.elementColors?.tableRowAlt || settings.colors.accentColor}
                        onChange={(e) => updateNestedSetting('elementColors', 'tableRowAlt', e.target.value)}
                        className="w-16 h-10"
                      />
                      <Input
                        type="text"
                        value={settings.elementColors?.tableRowAlt || ''}
                        onChange={(e) => updateNestedSetting('elementColors', 'tableRowAlt', e.target.value)}
                        placeholder="Use accent color"
                        className="flex-1"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="textColor">Text Color</Label>
                    <div className="flex gap-2 items-center">
                      <Input
                        id="textColor"
                        type="color"
                        value={settings.elementColors?.textColor || settings.colors.primaryColor}
                        onChange={(e) => updateNestedSetting('elementColors', 'textColor', e.target.value)}
                        className="w-16 h-10"
                      />
                      <Input
                        type="text"
                        value={settings.elementColors?.textColor || ''}
                        onChange={(e) => updateNestedSetting('elementColors', 'textColor', e.target.value)}
                        placeholder="Use primary color"
                        className="flex-1"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="recentActivityBg">Recent Activity Background</Label>
                    <div className="flex gap-2 items-center">
                      <Input
                        id="recentActivityBg"
                        type="color"
                        value={settings.elementColors?.recentActivityBg || '#4a7a8f'}
                        onChange={(e) => updateNestedSetting('elementColors', 'recentActivityBg', e.target.value)}
                        className="w-16 h-10"
                      />
                      <Input
                        type="text"
                        value={settings.elementColors?.recentActivityBg || ''}
                        onChange={(e) => updateNestedSetting('elementColors', 'recentActivityBg', e.target.value)}
                        placeholder="#4a7a8f (dark teal)"
                        className="flex-1"
                      />
                    </div>
                  </div>
                </div>

                <Button 
                  onClick={() => updateSetting('elementColors', {})} 
                  variant="outline" 
                  className="w-full"
                >
                  Clear All Element Color Overrides
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="individual" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Flight Points Slide</CardTitle>
              <CardDescription>Customize the Flight Points slide individually</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fp-title">Slide Title</Label>
                <Input
                  id="fp-title"
                  value={settings.slideCustomization?.flightPoints?.title || ''}
                  onChange={(e) => updateSlideCustomization('flightPoints', 'title', e.target.value)}
                  placeholder="Flight points:"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fp-left-title">Left Table Title</Label>
                  <Input
                    id="fp-left-title"
                    value={settings.slideCustomization?.flightPoints?.leftTableTitle || ''}
                    onChange={(e) => updateSlideCustomization('flightPoints', 'leftTableTitle', e.target.value)}
                    placeholder="Flight point totals:"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fp-right-title">Right Table Title</Label>
                  <Input
                    id="fp-right-title"
                    value={settings.slideCustomization?.flightPoints?.rightTableTitle || ''}
                    onChange={(e) => updateSlideCustomization('flightPoints', 'rightTableTitle', e.target.value)}
                    placeholder="Who has the most points:"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fp-left-scale">Left Table Scale: {(settings.slideCustomization?.flightPoints?.leftTableScale || 1).toFixed(2)}x</Label>
                  <Input
                    id="fp-left-scale"
                    type="range"
                    min={0.5}
                    max={1.5}
                    step={0.05}
                    value={settings.slideCustomization?.flightPoints?.leftTableScale || 1}
                    onChange={(e) => updateSlideCustomization('flightPoints', 'leftTableScale', parseFloat(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fp-right-scale">Right Table Scale: {(settings.slideCustomization?.flightPoints?.rightTableScale || 1).toFixed(2)}x</Label>
                  <Input
                    id="fp-right-scale"
                    type="range"
                    min={0.5}
                    max={1.5}
                    step={0.05}
                    value={settings.slideCustomization?.flightPoints?.rightTableScale || 1}
                    onChange={(e) => updateSlideCustomization('flightPoints', 'rightTableScale', parseFloat(e.target.value))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fp-title-size">Title Font (px)</Label>
                  <Input
                    id="fp-title-size"
                    type="number"
                    min={20}
                    max={120}
                    value={settings.slideCustomization?.flightPoints?.titleFontSize || 60}
                    onChange={(e) => updateSlideCustomization('flightPoints', 'titleFontSize', parseInt(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fp-section-size">Section Title (px)</Label>
                  <Input
                    id="fp-section-size"
                    type="number"
                    min={16}
                    max={80}
                    value={settings.slideCustomization?.flightPoints?.sectionTitleFontSize || 40}
                    onChange={(e) => updateSlideCustomization('flightPoints', 'sectionTitleFontSize', parseInt(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fp-table-size">Table Font (px)</Label>
                  <Input
                    id="fp-table-size"
                    type="number"
                    min={12}
                    max={48}
                    value={settings.slideCustomization?.flightPoints?.tableFontSize || 24}
                    onChange={(e) => updateSlideCustomization('flightPoints', 'tableFontSize', parseInt(e.target.value))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Activity Slide</CardTitle>
              <CardDescription>Customize the Recent Points Activity slide</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ra-title">Slide Title</Label>
                <Input
                  id="ra-title"
                  value={settings.slideCustomization?.recentActivity?.title || ''}
                  onChange={(e) => updateSlideCustomization('recentActivity', 'title', e.target.value)}
                  placeholder="Who Got Points Recently"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ra-row-count">Number of Rows to Show</Label>
                <Input
                  id="ra-row-count"
                  type="number"
                  min={5}
                  max={20}
                  value={settings.slideCustomization?.recentActivity?.rowCount || 12}
                  onChange={(e) => updateSlideCustomization('recentActivity', 'rowCount', parseInt(e.target.value))}
                />
                <p className="text-sm text-muted-foreground">
                  Shows the {settings.slideCustomization?.recentActivity?.rowCount || 12} most recent point entries
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ra-title-size">Title Font (px)</Label>
                  <Input
                    id="ra-title-size"
                    type="number"
                    min={20}
                    max={100}
                    value={settings.slideCustomization?.recentActivity?.titleFontSize || 50}
                    onChange={(e) => updateSlideCustomization('recentActivity', 'titleFontSize', parseInt(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ra-table-size">Table Font (px)</Label>
                  <Input
                    id="ra-table-size"
                    type="number"
                    min={10}
                    max={32}
                    value={settings.slideCustomization?.recentActivity?.tableFontSize || 16}
                    onChange={(e) => updateSlideCustomization('recentActivity', 'tableFontSize', parseInt(e.target.value))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Complete Leaderboard Slide</CardTitle>
              <CardDescription>Customize the Complete Leaderboard slide</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cl-title">Slide Title</Label>
                <Input
                  id="cl-title"
                  value={settings.slideCustomization?.completeLeaderboard?.title || ''}
                  onChange={(e) => updateSlideCustomization('completeLeaderboard', 'title', e.target.value)}
                  placeholder="Complete Leaderboard"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cl-title-size">Title Font (px)</Label>
                  <Input
                    id="cl-title-size"
                    type="number"
                    min={20}
                    max={100}
                    value={settings.slideCustomization?.completeLeaderboard?.titleFontSize || 50}
                    onChange={(e) => updateSlideCustomization('completeLeaderboard', 'titleFontSize', parseInt(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cl-table-size">Table Font (px)</Label>
                  <Input
                    id="cl-table-size"
                    type="number"
                    min={10}
                    max={32}
                    value={settings.slideCustomization?.completeLeaderboard?.tableFontSize || 16}
                    onChange={(e) => updateSlideCustomization('completeLeaderboard', 'tableFontSize', parseInt(e.target.value))}
                  />
                </div>
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
