'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Search,
  Layers,
  GitBranch
} from 'lucide-react';

interface GraphNode {
  id: string;
  topic: string | null;
  hsk_level: string | null;
  category: string | null;
  subcategory: string | null;
  description?: string | null;
  definition?: string | null;
  usage_notes?: string | null;
  cultural_significance?: string | null;
  // 层级相关属性
  parent_name?: string | null;
  is_split_child?: boolean;
  is_aggregate?: boolean;
  // Level/Domain元节点属性
  labels?: string[];
  level_order?: number;
  domain_order?: number;
  icon?: string;
  // 用于区分节点类型
  nodeType?: 'culture' | 'level' | 'domain';
  [key: string]: unknown;
  x?: number;
  y?: number;
}

// 视图模式类型
type ViewMode = 'all' | 'split' | 'aggregate' | 'hierarchy' | 'contrasts';

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  properties?: Record<string, unknown>;
}

interface NodeDetail {
  id: string;
  labels: string[];
  properties: Record<string, unknown>;
  contrasts?: Array<Record<string, unknown>>;
}

// 提取 HSK 等级数字
const extractHskNum = (level: string | null): number => {
  if (!level) return 0;
  const match = level.match(/HSK\s*(\d+)/i);
  return match ? parseInt(match[1]) : 0;
};

// 分类颜色
const getCategoryColor = (category: string | null, node?: GraphNode): string => {
  // 优先按节点类型区分
  if (node?.labels?.includes('Level')) {
    // Level元节点 - 使用配置的color
    return '#1e293b'; // 深灰色
  }
  if (node?.labels?.includes('Domain')) {
    // Domain元节点 - 紫色
    return '#8b5cf6';
  }
  if (node?.labels?.includes('CrossCultureContrast')) {
    // 跨文化对比节点 - 橙红色
    return '#f97316';
  }
  if (node?.is_split_child) {
    return '#3b82f6'; // 蓝色 - 细粒度节点
  }
  if (node?.is_aggregate || node?.parent_name) {
    return '#8b5cf6'; // 紫色 - 聚合节点
  }
  
  // 按分类区分
  if (!category) return '#94a3b8';
  if (category.includes('传统') || category.includes('文化')) return '#f59e0b';
  if (category.includes('当代') || category.includes('中国')) return '#3b82f6';
  if (category.includes('社会') || category.includes('生活')) return '#22c55e';
  return '#94a3b8';
};

// 获取节点大小
const getNodeSize = (node?: GraphNode): number => {
  if (node?.labels?.includes('Level')) return 40; // Level元节点最大
  if (node?.labels?.includes('Domain')) return 30; // Domain元节点中等
  if (node?.labels?.includes('CrossCultureContrast')) {
    // 跨文化对比节点根据知识点数量调整大小
    const props = node.properties as Record<string, unknown>;
    const count = (props?.['node_count'] as number) || 5;
    return Math.min(35, 15 + count * 0.5);
  }
  if (node?.is_aggregate) return 25;
  return 12;
};

// HSK 等级颜色
const getHskColor = (level: string | null): string => {
  const num = extractHskNum(level);
  if (num <= 2) return '#10b981';
  if (num <= 4) return '#f59e0b';
  return '#ef4444';
};

export default function InteractiveGraphVisualization() {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [nodeDetails, setNodeDetails] = useState<NodeDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showLabels, setShowLabels] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // 获取数据
  useEffect(() => {
    fetchGraphData();
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleResize = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDimensions({ width: rect.width, height: Math.max(500, rect.height - 50) });
    }
  }, []);

  const fetchGraphData = async () => {
    try {
      const nodesRes = await fetch('/api/knowledge/graph?action=nodes');
      const nodesData = await nodesRes.json();

      if (nodesData.success && nodesData.nodes) {
        let graphNodes: GraphNode[] = nodesData.nodes
          .filter((n: GraphNode) => n.id || n.topic || n.category)
          .map((n: GraphNode, idx: number) => ({
            ...n,
            id: n.id || `node_${idx}`,
            topic: n.topic || n.name || n.id || `节点 ${idx + 1}`,
            // 从API响应中提取层级属性
            parent_name: n.parent_name || null,
            is_split_child: n.is_split_child || false,
            is_aggregate: n.is_aggregate || false
          }));

        // 如果是层级视图，额外获取Level和Domain元节点
        if (viewMode === 'hierarchy') {
          try {
            const hierarchyRes = await fetch('/api/knowledge/graph?action=hierarchy');
            const hierarchyData = await hierarchyRes.json();
            
            if (hierarchyData.success) {
              // 添加Level节点
              const levelNodes: GraphNode[] = (hierarchyData.levels || []).map((l: Record<string, unknown>) => ({
                id: `level_${l.id}`,
                topic: l.name as string || l.id as string,
                labels: ['Level'],
                hsk_level: l.name as string || null,
                category: null,
                subcategory: null,
                properties: { 
                  level: l.name,
                  count: l.nodeCount,
                  nodeType: 'Level'
                }
              }));
              
              // 添加Domain节点
              const domainNodes: GraphNode[] = (hierarchyData.domains || []).map((d: Record<string, unknown>) => ({
                id: `domain_${d.id}`,
                topic: d.name as string || d.id as string,
                labels: ['Domain'],
                hsk_level: null,
                category: d.name as string || null,
                subcategory: null,
                properties: { 
                  domain: d.name,
                  count: d.nodeCount,
                  nodeType: 'Domain'
                }
              }));
              
              // 添加跨文化对比节点
              const contrastNodes: GraphNode[] = (hierarchyData.contrastNodes || []).map((c: Record<string, unknown>) => ({
                id: c.id as string,
                topic: c.name as string || c.theme as string,
                labels: ['CrossCultureContrast'],
                hsk_level: c.hsk_level as string || null,
                category: c.category as string || null,
                subcategory: c.theme as string || null,
                properties: { 
                  theme: c.theme,
                  node_count: c.node_count,
                  nodeType: 'CrossCultureContrast'
                }
              }));
              
              graphNodes = [...levelNodes, ...domainNodes, ...contrastNodes, ...graphNodes];
            }
          } catch (e) {
            console.error('Failed to fetch hierarchy data:', e);
          }
        }

        // 如果是跨文化对比视图
        if (viewMode === 'contrasts') {
          try {
            const contrastRes = await fetch('/api/knowledge/graph?action=contrasts');
            const contrastData = await contrastRes.json();
            
            if (contrastData.success && contrastData.contrastNodes) {
              const contrastGraphNodes: GraphNode[] = contrastData.contrastNodes.map((c: Record<string, unknown>) => ({
                id: c.id as string,
                topic: c.name as string || c.theme as string,
                labels: ['CrossCultureContrast'],
                hsk_level: c.hsk_level as string || null,
                category: c.category as string || null,
                subcategory: c.theme as string || null,
                properties: {
                  theme: c.theme,
                  node_count: c.node_count,
                  description: c.description,
                  nodeType: 'CrossCultureContrast'
                }
              }));
              
              // 获取对比节点关联的知识点
              const contrastWithNodesRes = await fetch('/api/knowledge/graph?action=contrast_nodes');
              const contrastWithNodesData = await contrastWithNodesRes.json();
              
              if (contrastWithNodesData.success && contrastWithNodesData.contrasts) {
                // 创建知识点节点
                const relatedCultureNodes = new Map<string, GraphNode>();
                
                contrastWithNodesData.contrasts.forEach((contrast: Record<string, unknown>) => {
                  const relatedNodes = contrast.related_nodes as Array<Record<string, unknown>>;
                  relatedNodes.forEach((rn: Record<string, unknown>) => {
                    if (rn.id && rn.topic && !relatedCultureNodes.has(rn.id as string)) {
                      relatedCultureNodes.set(rn.id as string, {
                        id: rn.id as string,
                        topic: rn.topic as string,
                        labels: ['CultureNode'],
                        hsk_level: rn.hsk_level as string || null,
                        category: rn.category as string || null,
                        subcategory: null,
                        properties: {}
                      });
                    }
                  });
                });
                
                // 添加对比节点和知识点
                graphNodes = [...contrastGraphNodes, ...Array.from(relatedCultureNodes.values())];
              }
            }
          } catch (e) {
            console.error('Failed to fetch contrasts data:', e);
          }
        }

        // 获取SAME_GROUP关系
        const edgesRes = await fetch('/api/knowledge/graph?action=edges');
        const edgesData = await edgesRes.json();
        
        let graphEdges: GraphEdge[] = [];
        if (edgesData.success && edgesData.edges) {
          graphEdges = edgesData.edges;
        }
        
        // 如果是层级视图，添加与Level和Domain的关联关系
        if (viewMode === 'hierarchy') {
          const hierarchyEdges = generateHierarchyEdges(graphNodes);
          graphEdges = [...graphEdges, ...hierarchyEdges];
        }
        
        // 如果是跨文化对比视图，添加 BELONGS_TO_CONTRAST 关系
        if (viewMode === 'contrasts') {
          const contrastEdges = generateContrastEdges(graphNodes);
          graphEdges = [...graphEdges, ...contrastEdges];
        }
        
        // 添加SAME_GROUP关系
        graphEdges = [...graphEdges, ...generateSameGroupEdges(graphNodes)];
        
        initializePositions(graphNodes, graphEdges);

        setNodes(graphNodes);
        setEdges(graphEdges);
      }
    } catch (error) {
      console.error('Failed to fetch graph data:', error);
    } finally {
      setLoading(false);
    }
  };

  // 生成层级关联关系（CultureNode -> Level, CultureNode -> Domain）
  const generateHierarchyEdges = (nodes: GraphNode[]): GraphEdge[] => {
    const edges: GraphEdge[] = [];
    
    nodes.forEach((node, idx) => {
      // 如果有HSK等级，连接到Level节点
      if (node.hsk_level && !node.labels?.includes('CrossCultureContrast')) {
        edges.push({
          id: `belong_level_${idx}`,
          source: node.id,
          target: `level_${node.hsk_level}`,
          type: 'BELONGS_TO_LEVEL'
        });
      }
      
      // 如果有分类，连接到Domain节点
      if (node.category && !node.labels?.includes('CrossCultureContrast')) {
        edges.push({
          id: `belong_domain_${idx}`,
          source: node.id,
          target: `domain_${node.category}`,
          type: 'BELONGS_TO_DOMAIN'
        });
      }
    });
    
    return edges;
  };

  // 生成跨文化对比关系（CultureNode -> CrossCultureContrast）
  const generateContrastEdges = (nodes: GraphNode[]): GraphEdge[] => {
    const edges: GraphEdge[] = [];
    const contrastNodes = nodes.filter(n => n.labels?.includes('CrossCultureContrast'));
    const cultureNodes = nodes.filter(n => n.labels?.includes('CultureNode') || !n.labels?.includes('CrossCultureContrast'));
    
    contrastNodes.forEach(contrast => {
      cultureNodes.forEach(culture => {
        // 基于主题相似性建立关系
        if (culture.topic && contrast.topic) {
          const contrastName = contrast.topic.toLowerCase();
          const cultureTopic = culture.topic.toLowerCase();
          
          // 检查是否有匹配
          if (contrastName.includes(cultureTopic) || 
              cultureTopic.includes(contrastName.replace(/hsdk?\d*[-_]/gi, '').replace(/[_\s]/g, '')) ||
              (contrast.subcategory && culture.category && contrast.subcategory === culture.category)) {
            edges.push({
              id: `contrast_${contrast.id}_${culture.id}`,
              source: culture.id,
              target: contrast.id,
              type: 'BELONGS_TO_CONTRAST'
            });
          }
        }
      });
    });
    
    return edges;
  };

  // 生成SAME_GROUP关系
  const generateSameGroupEdges = (nodes: GraphNode[]): GraphEdge[] => {
    const edges: GraphEdge[] = [];
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    
    // 按parent_name分组
    const groupMap = new Map<string, GraphNode[]>();
    nodes.forEach(n => {
      if (n.parent_name && !n.is_aggregate) {
        const existing = groupMap.get(n.parent_name) || [];
        existing.push(n);
        groupMap.set(n.parent_name, existing);
      }
    });
    
    // 为每个组创建顺序关系
    groupMap.forEach((groupNodes, parentName) => {
      for (let i = 0; i < groupNodes.length - 1; i++) {
        edges.push({
          id: `same_group_${i}`,
          source: groupNodes[i].id,
          target: groupNodes[i + 1].id,
          type: 'SAME_GROUP',
          properties: { group_name: parentName }
        });
      }
    });
    
    return edges;
  };

  const generateEdges = (nodes: GraphNode[]): GraphEdge[] => {
    const edges: GraphEdge[] = [];

    const byLevel = new Map<string, GraphNode[]>();
    nodes.forEach(n => {
      const level = n.hsk_level || 'unknown';
      if (!byLevel.has(level)) byLevel.set(level, []);
      byLevel.get(level)!.push(n);
    });

    byLevel.forEach((levelNodes) => {
      if (levelNodes.length > 1) {
        const sampleSize = Math.min(5, levelNodes.length);
        for (let i = 0; i < sampleSize - 1; i++) {
          edges.push({
            id: `edge_${levelNodes[i].id}_${levelNodes[i + 1].id}`,
            source: levelNodes[i].id,
            target: levelNodes[i + 1].id,
            type: 'SAME_LEVEL'
          });
        }
      }
    });

    return edges;
  };

  const initializePositions = (nodes: GraphNode[], _edges: GraphEdge[]) => {
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;
    const radius = Math.min(dimensions.width, dimensions.height) / 2.5;

    // 层级视图特殊布局：Level和Domain节点在中心区域
    const isHierarchy = viewMode === 'hierarchy';
    
    if (isHierarchy) {
      // Level节点排列在顶部
      const levelNodes = nodes.filter(n => n.labels?.includes('Level'));
      const levelCount = levelNodes.length;
      levelNodes.forEach((node, idx) => {
        const spacing = Math.min(200, dimensions.width / (levelCount + 1));
        node.x = centerX - (levelCount - 1) * spacing / 2 + idx * spacing;
        node.y = 80;
      });

      // Domain节点排列在左侧
      const domainNodes = nodes.filter(n => n.labels?.includes('Domain'));
      const domainCount = domainNodes.length;
      domainNodes.forEach((node, idx) => {
        const spacing = Math.min(80, dimensions.height / (domainCount + 1));
        node.x = 100;
        node.y = centerY - (domainCount - 1) * spacing / 2 + idx * spacing;
      });

      // CultureNode围绕边缘分布
      const cultureNodes = nodes.filter(n => !n.labels?.includes('Level') && !n.labels?.includes('Domain'));
      const byHskLevel = new Map<string, GraphNode[]>();
      cultureNodes.forEach(n => {
        const level = n.hsk_level || 'unknown';
        if (!byHskLevel.has(level)) byHskLevel.set(level, []);
        byHskLevel.get(level)!.push(n);
      });

      const levels = Array.from(byHskLevel.keys()).sort();
      const ringRadius = Math.min(dimensions.width, dimensions.height) / 2.2;
      levels.forEach((level, idx) => {
        const levelNodes = byHskLevel.get(level)!;
        const angleStep = (2 * Math.PI) / Math.max(levelNodes.length, 1);
        const levelRadius = ringRadius - idx * 60;

        levelNodes.forEach((node, nodeIdx) => {
          const angle = nodeIdx * angleStep - Math.PI / 2;
          node.x = centerX + levelRadius * Math.cos(angle);
          node.y = centerY + levelRadius * Math.sin(angle);
        });
      });
    } else {
      // 普通视图：按HSK等级分层
      const byLevel = new Map<string, GraphNode[]>();
      nodes.forEach(n => {
        const level = n.hsk_level || 'unknown';
        if (!byLevel.has(level)) byLevel.set(level, []);
        byLevel.get(level)!.push(n);
      });

      const levels = Array.from(byLevel.keys()).sort();
      levels.forEach((level, idx) => {
        const levelNodes = byLevel.get(level)!;
        const angleStep = (2 * Math.PI) / Math.max(levelNodes.length, 1);
        const levelRadius = radius - idx * 80;

        levelNodes.forEach((node, nodeIdx) => {
          const angle = nodeIdx * angleStep - Math.PI / 2;
          node.x = centerX + levelRadius * Math.cos(angle);
          node.y = centerY + levelRadius * Math.sin(angle);
        });
      });
    }
  };

  useEffect(() => {
    if (nodes.length === 0) return;

    const simulation = () => {
      const alpha = 0.1;
      const repulsion = 500;
      const attraction = 0.01;
      const centerX = dimensions.width / 2;
      const centerY = dimensions.height / 2;

      nodes.forEach(node => {
        if (!node.x || !node.y) return;

        let fx = 0;
        let fy = 0;

        fx += (centerX - node.x) * 0.01;
        fy += (centerY - node.y) * 0.01;

        nodes.forEach(other => {
          if (other.id === node.id || !other.x || !other.y) return;
          const dx = node.x! - other.x;
          const dy = node.y! - other.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = repulsion / (dist * dist);
          fx += (dx / dist) * force;
          fy += (dy / dist) * force;
        });

        edges.forEach(edge => {
          if (edge.source === node.id || edge.target === node.id) {
            const other = nodes.find(n => n.id === (edge.source === node.id ? edge.target : edge.source));
            if (other && other.x && other.y) {
              const dx = other.x - node.x!;
              const dy = other.y - node.y!;
              fx += dx * attraction;
              fy += dy * attraction;
            }
          }
        });

        node.x += fx * alpha;
        node.y += fy * alpha;
        node.x = Math.max(50, Math.min(dimensions.width - 50, node.x));
        node.y = Math.max(50, Math.min(dimensions.height - 50, node.y));
      });

      setNodes([...nodes]);
    };

    const interval = setInterval(simulation, 50);
    return () => clearInterval(interval);
  }, [nodes.length, edges.length, dimensions]);

  const filteredNodes = nodes.filter(node => {
    // 层级视图显示所有节点
    if (viewMode === 'hierarchy') return true;
    
    // 视图模式过滤
    if (viewMode === 'split' && !node.is_split_child) return false;
    if (viewMode === 'aggregate' && !node.is_aggregate && !node.parent_name) return false;
    
    const matchesSearch = searchTerm === '' || 
      (node.topic?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (node.id?.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesLevel = selectedLevel === 'all' || 
      (node.hsk_level?.includes(selectedLevel.replace('hsk', '')));
    
    const matchesCategory = selectedCategory === 'all' ||
      (node.category?.includes(selectedCategory));

    return matchesSearch && matchesLevel && matchesCategory;
  });

  const filteredEdges = edges.filter(edge => {
    return filteredNodes.some(n => n.id === edge.source) && 
           filteredNodes.some(n => n.id === edge.target);
  });

  const handleNodeClick = async (node: GraphNode) => {
    setSelectedNode(node);
    setDetailOpen(true);

    // 从节点对象中提取所有字段
    const props: Record<string, unknown> = {
      topic: node.topic || node.id,
      hsk_level: node.hsk_level || null,
      category: node.category || null,
      subcategory: node.subcategory || null,
      parent_name: node.parent_name || null,
      is_split_child: node.is_split_child || false,
      is_aggregate: node.is_aggregate || false,
      // 直接从节点提取所有可能存在的字段
      name: node.name || node.topic || null,
      hierarchy: node.hierarchy || null,
      language_binding: node.language_binding || null,
      description: node.description || null,
      definition: node.definition || null,
      usage_notes: node.usage_notes || null,
      cultural_significance: node.cultural_significance || null,
      difficulty_tier: node.difficulty_tier || null,
      teaching_order: node.teaching_order || null,
    };

    // 获取跨文化对比
    let contrasts: Record<string, unknown>[] = [];
    try {
      const contrastRes = await fetch(`/api/knowledge/graph?action=kp_contrasts&kp_id=${encodeURIComponent(node.id)}`);
      const contrastData = await contrastRes.json();
      if (contrastData.success) {
        contrasts = (contrastData.contrasts || []) as Record<string, unknown>[];
      }
    } catch {
      // 忽略错误
    }

    setNodeDetails({
      id: node.id,
      labels: node.labels || ['CultureNode'],
      properties: props,
      contrasts
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-muted-foreground">加载知识图谱...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-4 p-4 bg-muted/50 rounded-lg">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="搜索节点..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-[200px]"
          />
        </div>

        <Select value={selectedLevel} onValueChange={setSelectedLevel}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="HSK等级" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部等级</SelectItem>
            <SelectItem value="hsk1">HSK 1</SelectItem>
            <SelectItem value="hsk2">HSK 2</SelectItem>
            <SelectItem value="hsk3">HSK 3</SelectItem>
            <SelectItem value="hsk4">HSK 4</SelectItem>
            <SelectItem value="hsk5">HSK 5</SelectItem>
            <SelectItem value="hsk6">HSK 6</SelectItem>
          </SelectContent>
        </Select>

        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="分类" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部分类</SelectItem>
            <SelectItem value="传统">传统文化</SelectItem>
            <SelectItem value="当代">当代中国</SelectItem>
            <SelectItem value="社会">社会生活</SelectItem>
          </SelectContent>
        </Select>

        <Separator orientation="vertical" className="h-8" />

        {/* 视图模式切换 */}
        <div className="flex items-center gap-1 bg-muted rounded-md p-1">
          <Button 
            variant={viewMode === 'all' ? 'default' : 'ghost'} 
            size="sm"
            onClick={() => setViewMode('all')}
            title="全部节点"
          >
            全部
          </Button>
          <Button 
            variant={viewMode === 'hierarchy' ? 'default' : 'ghost'} 
            size="sm"
            onClick={() => setViewMode('hierarchy')}
            title="层级视图：显示Level和Domain元节点"
          >
            层级
          </Button>
          <Button 
            variant={viewMode === 'contrasts' ? 'default' : 'ghost'} 
            size="sm"
            onClick={() => setViewMode('contrasts')}
            title="跨文化对比视图：显示聚类生成的跨文化对比节点"
          >
            对比
          </Button>
          <Button 
            variant={viewMode === 'split' ? 'default' : 'ghost'} 
            size="sm"
            onClick={() => setViewMode('split')}
            title="仅显示拆分后的细粒度节点"
          >
            细粒度
          </Button>
          <Button 
            variant={viewMode === 'aggregate' ? 'default' : 'ghost'} 
            size="sm"
            onClick={() => setViewMode('aggregate')}
            title="仅显示聚合节点"
          >
            聚合
          </Button>
        </div>

        <Separator orientation="vertical" className="h-8" />

        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => setDimensions(d => ({ ...d, width: d.width * 1.1, height: d.height * 1.1 }))}>
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setDimensions(d => ({ ...d, width: d.width / 1.1, height: d.height / 1.1 }))}>
            <ZoomOut className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => { setDimensions({ width: 800, height: 600 }); }}>
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>

        <Button 
          variant={showLabels ? 'default' : 'outline'} 
          size="sm"
          onClick={() => setShowLabels(!showLabels)}
        >
          <Layers className="w-4 h-4 mr-1" />
          标签
        </Button>

        <Badge variant="outline" className="ml-auto">
          {filteredNodes.length} 节点 / {filteredEdges.length} 边
        </Badge>
      </div>

      {/* 图谱画布 */}
      <div 
        ref={containerRef}
        className="relative border rounded-lg overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100"
        style={{ height: dimensions.height }}
      >
        <svg
          ref={svgRef}
          width={dimensions.width}
          height={dimensions.height}
          className="cursor-grab active:cursor-grabbing"
        >
          {/* 边 */}
          <g className="edges">
            {filteredEdges.map(edge => {
              const sourceNode = nodes.find(n => n.id === edge.source);
              const targetNode = nodes.find(n => n.id === edge.target);

              if (!sourceNode?.x || !sourceNode?.y || !targetNode?.x || !targetNode?.y) return null;

              return (
                <line
                  key={edge.id}
                  x1={sourceNode.x}
                  y1={sourceNode.y}
                  x2={targetNode.x}
                  y2={targetNode.y}
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                  strokeOpacity={0.6}
                  strokeDasharray={edge.type === 'SAME_LEVEL' ? '4,4' : '0'}
                />
              );
            })}
          </g>

          {/* 节点 */}
          <g className="nodes">
            {filteredNodes.map(node => {
              if (!node.x || !node.y) return null;
              
              // Level/Domain元节点使用更大的尺寸
              const isMetaNode = node.labels?.includes('Level') || node.labels?.includes('Domain');
              const baseRadius = isMetaNode ? getNodeSize(node) : (node.topic && node.topic.length > 8) ? 28 : 24;
              const bgColor = getCategoryColor(node.category, node);
              const borderColor = getHskColor(node.hsk_level);
              const label = node.topic?.substring(0, isMetaNode ? 10 : 6) || node.id.substring(0, 6);

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={() => handleNodeClick(node)}
                  style={{ cursor: 'pointer' }}
                >
                  {isMetaNode && (
                    // 元节点的特殊外圈
                    <circle
                      r={baseRadius + 8}
                      fill="none"
                      stroke={bgColor}
                      strokeWidth={3}
                      strokeOpacity={0.4}
                    />
                  )}
                  <circle
                    r={baseRadius + 4}
                    fill="white"
                    stroke={isMetaNode ? bgColor : borderColor}
                    strokeWidth={2}
                    strokeOpacity={0.8}
                  />
                  <circle
                    r={baseRadius}
                    fill={bgColor}
                    stroke={isMetaNode ? bgColor : borderColor}
                    strokeWidth={2}
                    className="transition-all duration-200"
                  />
                  {showLabels && (
                    <text
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="white"
                      fontSize={isMetaNode ? 11 : 10}
                      fontWeight="600"
                      style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
                    >
                      {label}
                    </text>
                  )}
                  <title>{node.topic || node.id}</title>
                </g>
              );
            })}
          </g>
        </svg>

        {/* 图例 */}
        <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow-lg">
          <div className="text-xs font-semibold mb-2 text-muted-foreground">HSK 等级</div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-xs">HSK 1-2</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-amber-500"></div>
              <span className="text-xs">HSK 3-4</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <span className="text-xs">HSK 5-6</span>
            </div>
          </div>
          <Separator className="my-2" />
          <div className="text-xs font-semibold mb-2 text-muted-foreground">分类</div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-amber-500"></div>
              <span className="text-xs">传统文化</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              <span className="text-xs">当代中国</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-xs">社会生活</span>
            </div>
          </div>
          {viewMode === 'hierarchy' && (
            <>
              <Separator className="my-2" />
              <div className="text-xs font-semibold mb-2 text-muted-foreground">元节点</div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full border-2 border-slate-700 bg-white"></div>
                  <span className="text-xs">Level (HSK等级)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full border-2 border-purple-500 bg-purple-500"></div>
                  <span className="text-xs">Domain (文化领域)</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* 统计信息 */}
        <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow-lg">
          <div className="text-xs font-semibold mb-2 text-muted-foreground">图谱统计</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span className="text-xs text-muted-foreground">节点:</span>
            <span className="text-xs font-medium">{filteredNodes.length}</span>
            <span className="text-xs text-muted-foreground">边:</span>
            <span className="text-xs font-medium">{filteredEdges.length}</span>
          </div>
        </div>
      </div>

      {/* 节点详情弹窗 */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitBranch className="w-5 h-5" />
              {selectedNode?.topic || selectedNode?.id}
            </DialogTitle>
          </DialogHeader>
          
          {nodeDetails && (() => {
            const p = nodeDetails.properties as Record<string, string | number | boolean | object | null | undefined>;
            const str = (v: unknown) => String(v ?? '');
            const hasDetails = 
              (p.hierarchy && str(p.hierarchy).trim() !== '') ||
              (p.language_binding && str(p.language_binding).trim() !== '') ||
              (p.description && str(p.description).trim() !== '') ||
              (p.definition && str(p.definition).trim() !== '') ||
              (p.usage_notes && str(p.usage_notes).trim() !== '') ||
              (p.cultural_significance && str(p.cultural_significance).trim() !== '') ||
              (p.difficulty_tier && str(p.difficulty_tier).trim() !== '') ||
              (p.teaching_order && typeof p.teaching_order === 'object');
            
            return (
              <div className="space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">基本信息</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">ID:</span>
                      <code className="text-xs bg-muted px-2 py-1 rounded">{nodeDetails.id}</code>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">节点类型:</span>
                      <Badge variant={nodeDetails.properties.is_split_child ? 'secondary' : nodeDetails.properties.is_aggregate ? 'default' : 'outline'}>
                        {nodeDetails.properties.is_split_child ? '细粒度' : nodeDetails.properties.is_aggregate ? '聚合' : '独立'}
                      </Badge>
                    </div>
                    {Boolean(nodeDetails.properties.parent_name) && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">所属组:</span>
                        <Badge variant="secondary">
                          {String(nodeDetails.properties.parent_name)}
                        </Badge>
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">HSK等级:</span>
                      <Badge style={{ backgroundColor: getHskColor(nodeDetails.properties.hsk_level as string | null) }}>
                        {String(nodeDetails.properties.hsk_level || '未分类')}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">分类:</span>
                      <Badge variant="outline">
                        {String(nodeDetails.properties.category || '未分类').replace(/\s+/g, '')}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                {/* 详细信息卡片 */}
                {hasDetails && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">详细信息</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {p.name && str(p.name).trim() !== '' && (
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">名称</div>
                          <p className="text-sm">{str(p.name)}</p>
                        </div>
                      )}
                      {p.topic && str(p.topic).trim() !== '' && (
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">主题</div>
                          <p className="text-sm">{str(p.topic)}</p>
                        </div>
                      )}
                      {p.hierarchy && str(p.hierarchy).trim() !== '' && (
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">层级归属</div>
                          <p className="text-sm">{str(p.hierarchy)}</p>
                        </div>
                      )}
                      {p.language_binding && str(p.language_binding).trim() !== '' && (
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">语言绑定</div>
                          <p className="text-sm">{str(p.language_binding)}</p>
                        </div>
                      )}
                      {p.difficulty_tier && str(p.difficulty_tier).trim() !== '' && (
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">难度等级</div>
                          <p className="text-sm">{str(p.difficulty_tier)}</p>
                        </div>
                      )}
                      {p.definition && str(p.definition).trim() !== '' && (
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">定义</div>
                          <p className="text-sm">{str(p.definition)}</p>
                        </div>
                      )}
                      {p.description && str(p.description).trim() !== '' && (
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">描述</div>
                          <p className="text-sm">{str(p.description)}</p>
                        </div>
                      )}
                      {p.usage_notes && str(p.usage_notes).trim() !== '' && (
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">使用说明</div>
                          <p className="text-sm">{str(p.usage_notes)}</p>
                        </div>
                      )}
                      {p.cultural_significance && str(p.cultural_significance).trim() !== '' && (
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">文化意义</div>
                          <p className="text-sm">{str(p.cultural_significance)}</p>
                        </div>
                      )}
                      {p.teaching_order && typeof p.teaching_order === 'object' && (
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">教学顺序</div>
                          <code className="text-xs bg-muted px-2 py-1 rounded">
                            low: {String((p.teaching_order as Record<string, number>).low || 'N/A')}, 
                            high: {String((p.teaching_order as Record<string, number>).high || 'N/A')}
                          </code>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">关联关系</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[150px]">
                      <div className="space-y-2">
                        {filteredEdges
                          .filter(edge => edge.source === selectedNode?.id || edge.target === selectedNode?.id)
                          .map(edge => {
                            const connectedId = edge.source === selectedNode?.id ? edge.target : edge.source;
                            const connectedNode = nodes.find(n => n.id === connectedId);
                            
                            return (
                              <div 
                                key={edge.id}
                                className="flex items-center gap-2 p-2 bg-muted/50 rounded cursor-pointer hover:bg-muted"
                                onClick={() => connectedNode && handleNodeClick(connectedNode)}
                              >
                                <Badge variant="outline" className="text-xs">
                                  {edge.type || '关联'}
                                </Badge>
                                <span className="text-sm truncate">
                                  {connectedNode?.topic || connectedId}
                                </span>
                              </div>
                            );
                          })}
                        {filteredEdges.filter(edge => edge.source === selectedNode?.id || edge.target === selectedNode?.id).length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            暂无关联关系
                          </p>
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                {nodeDetails.contrasts && nodeDetails.contrasts.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">跨文化对比</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[150px]">
                        <div className="space-y-3">
                          {nodeDetails.contrasts.map((contrast, idx) => (
                            <div key={idx} className="p-3 bg-muted/50 rounded-lg">
                              <div className="flex items-center justify-between mb-2">
                                <Badge variant="secondary">{String(contrast.target_culture || '未知')}</Badge>
                                <span className="text-xs text-muted-foreground">
                                  {String(contrast.cultural_dimension || '一般')}
                                </span>
                              </div>
                              <div className="space-y-1 text-sm">
                                <div>
                                  <span className="text-green-600 font-medium">相似点: </span>
                                  <span>{String(contrast.similarities || '暂无')}</span>
                                </div>
                                <div>
                                  <span className="text-amber-600 font-medium">差异点: </span>
                                  <span>{String(contrast.differences || '暂无')}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
