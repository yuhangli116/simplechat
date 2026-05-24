delete from public.community_templates;

insert into public.community_templates (
  title,
  description,
  author_name,
  category,
  content,
  likes,
  downloads,
  is_official,
  cover_color,
  tags
)
values (
  '小说通用模板 (10章节版)',
  '包含 4 个思维导图页面与 10 章正文结构；思维导图含根节点+3个子节点，适合快速开写。',
  '官方',
  '网文小说',
  '{
    "type": "folder",
    "name": "小说通用模板",
    "children": [
      {
        "name": "作品相关",
        "type": "folder",
        "children": [
          {
            "name": "作品大纲",
            "type": "mindmap",
            "mindMapType": "outline",
            "savedMindMap": {
              "nodes": [
                { "id": "root", "type": "mindMap", "data": { "label": "作品大纲", "isRoot": true }, "position": { "x": 0, "y": 0 } },
                { "id": "c1", "type": "mindMap", "data": { "label": "开头" }, "position": { "x": 200, "y": -120 } },
                { "id": "c2", "type": "mindMap", "data": { "label": "发展" }, "position": { "x": 200, "y": 0 } },
                { "id": "c3", "type": "mindMap", "data": { "label": "高潮" }, "position": { "x": 200, "y": 120 } }
              ],
              "edges": [
                { "id": "e-root-c1", "source": "root", "target": "c1", "type": "straight" },
                { "id": "e-root-c2", "source": "root", "target": "c2", "type": "straight" },
                { "id": "e-root-c3", "source": "root", "target": "c3", "type": "straight" }
              ]
            }
          },
          {
            "name": "世界设定",
            "type": "mindmap",
            "mindMapType": "world",
            "savedMindMap": {
              "nodes": [
                { "id": "root", "type": "mindMap", "data": { "label": "世界设定", "isRoot": true }, "position": { "x": 0, "y": 0 } },
                { "id": "c1", "type": "mindMap", "data": { "label": "地理" }, "position": { "x": 200, "y": -120 } },
                { "id": "c2", "type": "mindMap", "data": { "label": "历史" }, "position": { "x": 200, "y": 0 } },
                { "id": "c3", "type": "mindMap", "data": { "label": "势力" }, "position": { "x": 200, "y": 120 } }
              ],
              "edges": [
                { "id": "e-root-c1", "source": "root", "target": "c1", "type": "straight" },
                { "id": "e-root-c2", "source": "root", "target": "c2", "type": "straight" },
                { "id": "e-root-c3", "source": "root", "target": "c3", "type": "straight" }
              ]
            }
          },
          {
            "name": "角色塑造",
            "type": "mindmap",
            "mindMapType": "character",
            "savedMindMap": {
              "nodes": [
                { "id": "root", "type": "mindMap", "data": { "label": "角色塑造", "isRoot": true }, "position": { "x": 0, "y": 0 } },
                { "id": "c1", "type": "mindMap", "data": { "label": "主角" }, "position": { "x": 200, "y": -120 } },
                { "id": "c2", "type": "mindMap", "data": { "label": "配角" }, "position": { "x": 200, "y": 0 } },
                { "id": "c3", "type": "mindMap", "data": { "label": "反派" }, "position": { "x": 200, "y": 120 } }
              ],
              "edges": [
                { "id": "e-root-c1", "source": "root", "target": "c1", "type": "straight" },
                { "id": "e-root-c2", "source": "root", "target": "c2", "type": "straight" },
                { "id": "e-root-c3", "source": "root", "target": "c3", "type": "straight" }
              ]
            }
          },
          {
            "name": "事件细纲",
            "type": "mindmap",
            "mindMapType": "event",
            "savedMindMap": {
              "nodes": [
                { "id": "root", "type": "mindMap", "data": { "label": "事件细纲", "isRoot": true }, "position": { "x": 0, "y": 0 } },
                { "id": "c1", "type": "mindMap", "data": { "label": "起因" }, "position": { "x": 200, "y": -120 } },
                { "id": "c2", "type": "mindMap", "data": { "label": "经过" }, "position": { "x": 200, "y": 0 } },
                { "id": "c3", "type": "mindMap", "data": { "label": "结果" }, "position": { "x": 200, "y": 120 } }
              ],
              "edges": [
                { "id": "e-root-c1", "source": "root", "target": "c1", "type": "straight" },
                { "id": "e-root-c2", "source": "root", "target": "c2", "type": "straight" },
                { "id": "e-root-c3", "source": "root", "target": "c3", "type": "straight" }
              ]
            }
          }
        ]
      },
      {
        "name": "正文情节",
        "type": "folder",
        "children": [
          { "name": "第1章", "type": "file" },
          { "name": "第2章", "type": "file" },
          { "name": "第3章", "type": "file" },
          { "name": "第4章", "type": "file" },
          { "name": "第5章", "type": "file" },
          { "name": "第6章", "type": "file" },
          { "name": "第7章", "type": "file" },
          { "name": "第8章", "type": "file" },
          { "name": "第9章", "type": "file" },
          { "name": "第10章", "type": "file" }
        ]
      }
    ]
  }'::jsonb,
  0,
  0,
  true,
  'bg-gradient-to-br from-orange-400 to-red-500',
  array[]::text[]
);
