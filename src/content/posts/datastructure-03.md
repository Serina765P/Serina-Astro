---
title: 数据结构笔记 第三章 栈和队列
date: 2026-03-26T15:50:37+08:00
tags:
  - 数据结构
  - 课堂笔记
categories:
  - 学习笔记
description: 本文是数据结构课程第三章栈和队列部分的课堂笔记，整理了栈、顺序栈、链栈、队列、循环队列、链队列及其典型应用，并完整收录课上示例代码。
---

## 第一节 栈

### 一、栈的定义

栈（stack）是仅允许在一端进行插入和删除的线性表。

- **栈顶**：进行插入、删除操作的一端
- **栈底**：另一端
- **操作特点**：后进先出（LIFO, Last In First Out）
- **插入操作**：入栈、进栈、压栈（Push）
- **删除操作**：出栈、弹栈（Pop）

<div class="callout callout-warning">
<b>栈的本质：它仍然是线性表，只是操作被限制在同一端进行。</b>
</div>

### 二、栈的应用场景

栈是一个非常常见的数据结构，典型应用包括：

- 十进制整数转换为P进制整数
- 括号匹配
- 表达式求值（操作符栈、操作数栈）
- 函数调用与返回
- 递归过程的实现

这些问题的共同特点是：**后处理的信息往往先被取出**，因此适合使用栈。

---

## 第二节 顺序栈

### 一、顺序栈的存储思想

对于 C/C++，通常使用数组表示栈的存储空间，用 `top` 表示栈顶位置。

- 数组下标从 `0` 开始
- 默认 `bottom = 0`
- 栈顶方向为下标增大的方向
- 对于空栈，`top = 0`

这里的 `top` 不代表栈顶元素的下标，而是可以理解为：

<div class="callout callout-warning callout-center">
<b>top = 栈顶元素位置 + 1</b>
</div>

因此：

- 空栈时 `top = 0`
- 栈顶元素为 `s.elem[s.top-1]`
- 栈中元素个数也正好等于 `top`

### 二、顺序栈类型定义

```c
#define MAXSIZE 100

typedef struct {
    ElemType *elem;
    int top;
} SqStack;
```

这个定义与顺序表形式上很接近，本质上是用一段连续存储空间保存元素，用 `top` 记录当前栈高。

### 三、顺序栈的基本操作

```c
int Init(SqStack &s) {
    s.elem = new ElemType[MAXSIZE];
    if (s.elem == NULL) return 0;
    s.top = 0;
    return 1;
}

void Destory(SqStack &s) {
    delete []s.elem;
}

void Clear(SqStack &s) {
    s.top = 0;
}

int Empty(SqStack s) {
    return s.top == 0;
}

int Length(SqStack s) {
    return s.top;
}

ElemType GetTop(SqStack s) {
    return s.elem[s.top - 1];
}

void Traverse(SqStack s) {
    for (int i = 0; i < s.top; i++)
        visit(s.elem[i]);
}

int Push(SqStack &s, ElemType e) {
    if (s.top == MAXSIZE) return 0;
    s.elem[s.top++] = e;
    return 1;
}

int Pop(SqStack &s, ElemType &e) {
    if (s.top == 0) return 0;
    e = s.elem[--s.top];
    return 1;
}

ElemType Pop(SqStack &s) {
    return s.elem[--s.top];
}
```

### 四、顺序栈的特点

- 优点：结构简单、访问栈顶效率高
- 缺点：容量固定，容易发生上溢
- 入栈、出栈、取栈顶的时间复杂度均为 `O(1)`

<div class="callout callout-danger">
<b>注意：</b>顺序栈需要防止两类错误：栈满时继续入栈会发生上溢，空栈时继续出栈会发生下溢。
</div>

---

## 第三节 链栈

### 一、链栈的存储思想

链栈一般用**无头结点的单链表**实现。

- 单链表首结点指针就是栈顶指针
- 尾结点可以看作栈底结点
- 空栈时指针为 `NULL`

它的核心思想是：每次都在链表头部插入和删除结点，因此天然符合栈“只在一端操作”的特点。

### 二、链栈类型定义

```c
typedef struct ENode {
    ElemType data;
    struct ENode *next;
} StackNode, *LinkStack;
```

### 三、链栈的基本操作

```c
void Init(LinkStack &s) {
    s = NULL;
}

void Destory(LinkStack &s) {
    LinkStack p;
    while (s != NULL) {
        p = s->next;
        delete s;
        s = p;
    }
}

void Clear(LinkStack &s) {
    Destory(s);
}

int Empty(LinkStack s) {
    return s == NULL;
}

int Length(LinkStack s) {
    int k = 0;
    while (s != NULL) {
        k++;
        s = s->next;
    }
    return k;
}

ElemType GetTop(LinkStack s) {
    return s->data;
}

void Traverse(LinkStack s) {
    while (s != NULL) {
        visit(s);
        s = s->next;
    }
}

int Push(LinkStack &s, ElemType e) {
    LinkStack t = new StackNode;
    t->data = e;
    t->next = s;
    s = t;
    return 1;
}

int Pop(LinkStack &s, ElemType &e) {
    LinkStack p = s;
    if (s == NULL) return 0;
    e = s->data;
    s = s->next;
    delete p;
    return 1;
}

ElemType Pop(LinkStack &s) {
    LinkStack p = s;
    ElemType e = s->data;
    s = s->next;
    delete p;
    return e;
}
```

### 四、链栈的特点

- 优点：不需要预先固定容量，不容易上溢
- 缺点：每个结点要额外存储指针域
- 入栈、出栈时间复杂度仍为 `O(1)`
- 求长度需要遍历，时间复杂度为 `O(n)`

顺序栈和链栈的主要区别不在逻辑结构，而在存储方式。

---

## 第四节 栈的典型应用

### 一、数制转换

十进制正整数转换为八进制整数时，可以不断对 8 取余。

- 第一次得到的是最低位
- 最后一次得到的是最高位

这和我们输出数字时需要的顺序正好相反，因此最适合借助栈“逆序输出”。

```c
void conversion(int n) {
    Stack s;
    int e;
    Init(s);
    while (n) {
        Push(s, n % 8);
        n /= 8;
    }
    while (!Empty(s)) {
        Pop(s, e);
        cout << e;
    }
}
```

<div class="callout callout-success">
<b>核心思想：</b>除基取余得到的是从低位到高位的序列，压入栈后再依次弹出，就得到从高位到低位的正确表示。
</div>

### 二、递归与栈

递归在数据结构中非常常见，主要体现在三个方面：

#### 1. 定义是递归的

例如：

- 阶乘函数
- 斐波那契数列
- 后续会学到的树等结构定义

#### 2. 数据结构本身是递归的

例如单链表结点定义：

```c
typedef struct ENode {
    ElemType data;
    struct ENode *next;
} LNode, *LinkList;
```

结点中包含“指向同类结点的指针”，这本身就是一种递归定义。

#### 3. 问题的求解过程是递归的

例如：

- 汉诺塔问题
- 八皇后问题
- 迷宫问题

### 三、函数调用中的栈

函数调用也依赖栈来完成。

```c
void main() {
    int a;
    a = add(3, 4);
    printf("%d", a);
}

int add(int x, int y) {
    int t;
    t = x + y;
    return t;
}
```

在调用过程中，栈大致完成如下工作：

1. 实参 `3` 和 `4` 压栈，返回地址压栈，转入 `add` 执行
2. 为局部变量 `t` 分配栈空间
3. 保存返回值，释放局部变量空间，返回地址出栈
4. 回到主函数后，将返回值赋给变量 `a`

因此，递归函数之所以能一层层调用自己，本质上也依赖系统栈保存现场信息。

### 四、递归与非递归的比较

- 有些递归算法可以借助栈改写成非递归算法
- 时间复杂度上，递归算法一般等于对应的非递归算法
- 空间复杂度上，递归算法通常大于非递归算法，因为需要额外调用栈空间

---

## 第五节 队列

### 一、队列的定义

队列（queue）是限定仅在一端进行插入、在另一端进行删除的线性表。

- **队头（front）**：允许删除的一端
- **队尾（rear）**：允许插入的一端
- **操作特点**：先进先出（FIFO, First In First Out）
- **插入操作**：入队（EnQueue）
- **删除操作**：出队（DeQueue）

<div class="callout callout-warning">
<b>队列和栈的区别在于：栈在同一端插删，队列在两端分工操作。</b>
</div>

### 二、队列的应用场景

队列适用于“先来的先处理”的问题，例如：

- 舞伴问题（男女双队列）
- I/O 缓冲区
- 打印队列
- 广度优先遍历
- 各类排队调度系统

---

## 第六节 顺序队列与循环队列

### 一、顺序队列的基本思想

对于 C/C++，可用数组表示队列空间，用 `front` 和 `rear` 记录位置。

- 初始空队列：`front = rear = 0`
- 删除队头元素时：`front++`
- 新元素入队时：`rear++`

其中：

- `front` 指向队头元素位置
- `rear` 指向队尾元素的下一个位置

### 二、顺序队列的假溢出问题

设想如下过程：

1. 初始为空队列
2. `a1`、`a2`、`a3`、`a4` 入队
3. `a1`、`a2` 出队
4. 再让 `a5`、`a6` 入队

虽然数组前面已经腾出了空间，但如果只是简单地让 `rear` 继续向后移动，就会出现“数组尾部没有位置”的现象。这种情况称为：

<div class="callout callout-danger callout-center">
<b>假溢出</b>
</div>

它不是真正没有空间，而是没有重复利用已经释放出的空间。

### 三、循环队列

解决假溢出最常见的方法就是循环队列。可以把数组想象成钟表盘，走到末尾后重新回到开头。

#### 1. 入队与出队

```c
rear = (rear + 1) % MAXSIZE;
front = (front + 1) % MAXSIZE;
```

#### 2. 判空与判满

循环队列中：

- 队空：`front == rear`
- 队满：`(rear + 1) % MAXSIZE == front`

这意味着如果数组大小为 `MAXSIZE`，通常最多只存放 `MAXSIZE - 1` 个元素。

### 四、循环队列类型定义与操作

```c
#define MAXSIZE 100

typedef struct {
    ElemType *elem;
    int front;
    int rear;
} SqQueue;

int Init(SqQueue &q) {
    q.elem = new ElemType[MAXSIZE];
    if (q.elem == NULL)
        return 0;
    q.front = q.rear = 0;
    return 1;
}

int Length(SqQueue q) {
    return (q.rear - q.front + MAXSIZE) % MAXSIZE;
}

int Empty(SqQueue q) {
    return q.rear == q.front;
}

int Full(SqQueue q) {
    return (q.rear + 1) % MAXSIZE == q.front;
}

ElemType GetHead(SqQueue q) {
    return q.elem[q.front];
}

ElemType GetTail(SqQueue q) {
    return q.elem[(q.rear - 1 + MAXSIZE) % MAXSIZE];
}

int EnQueue(SqQueue &q, ElemType e) {
    if (Full(q))
        return 0;
    q.elem[q.rear] = e;
    q.rear = (q.rear + 1) % MAXSIZE;
    return 1;
}

int DeQueue(SqQueue &q, ElemType &e) {
    if (Empty(q))
        return 0;
    e = q.elem[q.front];
    q.front = (q.front + 1) % MAXSIZE;
    return 1;
}
```

### 五、循环队列的特点

- 入队、出队、取队头时间复杂度均为 `O(1)`
- 能有效避免普通顺序队列的假溢出问题
- 但常规写法会浪费一个存储单元，用于区分“空”和“满”

---

## 第七节 链队列

### 一、链队列的存储思想

链队列通常使用带头结点的单链表实现，并同时设置队头指针与队尾指针。

- `front` 指向头结点
- `rear` 指向队尾结点
- 空队列时 `front == rear`

### 二、链队列类型定义

```c
typedef struct ENode {
    ElemType data;
    struct ENode *next;
} LNode, *LinkList;

typedef struct {
    LinkList front;
    LinkList rear;
} LinkQueue;
```

### 三、链队列的基本操作

```c
int Init(LinkQueue &q) {
    q.front = q.rear = new LNode;
    if (q.front == NULL)
        return 0;
    q.front->next = NULL;
    return 1;
}

int Length(LinkQueue q) {
    LinkList p = q.front;
    int k = 0;
    while ((p = p->next) != NULL)
        k++;
    return k;
}

int Empty(LinkQueue q) {
    return q.rear == q.front;
}

ElemType GetHead(LinkQueue q) {
    return q.front->next->data;
}

ElemType GetTail(LinkQueue q) {
    return q.rear->data;
}

int EnQueue(LinkQueue &q, ElemType e) {
    LinkList s = new LNode;
    if (s == NULL)
        return 0;
    s->data = e;
    s->next = NULL;
    q.rear->next = s;
    q.rear = s;
    return 1;
}

int DeQueue(LinkQueue &q, ElemType &e) {
    LinkList p;
    if (Empty(q))
        return 0;
    p = q.front->next;
    e = p->data;
    q.front->next = p->next;
    if (p->next == NULL)
        q.rear = q.front;
    delete p;
    return 1;
}
```

### 四、链队列的特点

- 不需要预先分配固定长度空间
- 不存在顺序队列中的假溢出问题
- 入队在尾部进行，出队在头部进行，效率都为 `O(1)`
- 需要额外指针域，存储开销略大于顺序结构

<div class="callout callout-danger">
<b>课件草稿中的链队列入队代码里出现了 `q.rear = (q.rear + 1) % MAXSIZE;` 这一句，这属于顺序循环队列写法，放在链队列中是不合适的。链队列应当直接令 `q.rear = s;`。</b>
</div>

---

## 第八节 栈与队列的对比

| 项目 | 栈 | 队列 |
|:---:|:---|:---|
| 逻辑结构 | 操作受限的线性表 | 操作受限的线性表 |
| 插入位置 | 只能在栈顶 | 只能在队尾 |
| 删除位置 | 只能在栈顶 | 只能在队头 |
| 操作规律 | 后进先出 LIFO | 先进先出 FIFO |
| 典型应用 | 递归、表达式、括号匹配 | 排队调度、缓冲、层序遍历 |

理解这张表，基本就抓住了本章的核心。

---

## 第九节 课件示例整理

这一节更适合初学者阅读。默认你已经学过基础程序设计，但还不太熟悉：

- `struct` 结构体
- 指针 `*`
- 引用 `&`
- 动态内存 `new/delete`、`malloc/free`
- 链表里“结点连起来”的思路


### 示例1：链栈基本操作（`3-1.cpp`）

这个程序演示了链栈的初始化、入栈、遍历、出栈、取栈顶、清空等操作。它是理解"链栈到底是什么"最重要的一份代码。

```cpp
#include "iostream.h"

typedef struct ENode {
    char data;
    struct ENode *next;
} Node, *Stack;

void Init(Stack &s) {
    s = NULL;
}

void Destory(Stack &s) {
    Stack p;
    while (s != NULL) {
        p = s->next;
        delete s;
        s = p;
    }
}

void Clear(Stack &s) {
    Destory(s);
}

int Empty(Stack s) {
    return s == NULL;
}

int Length(Stack s) {
    int k = 0;
    while (s != NULL) {
        k++;
        s = s->next;
    }
    return k;
}

char GetTop(Stack s) {
    return s->data;
}

void Traverse(Stack s) {
    while (s != NULL) {
        cout << s->data << "  ";
        s = s->next;
    }
}

void Push(Stack &s, char e) {
    Stack t = new Node;
    t->data = e;
    t->next = s;
    s = t;
}

int Pop(Stack &s, char &e) {
    Stack p = s;
    if (s == NULL) return 0;
    e = s->data;
    s = s->next;
    delete p;
    return 1;
}

void main() {
    int i = 0;
    char c;
    Stack s;
    Init(s);
    Clear(s);
    for (i = 0; i < 5; i++) {
        cin >> c;
        Push(s, c);
    }
    Traverse(s);
    cout << "弹出一个元素" << endl;
    Pop(s, c);
    cout << c;
    cout << "再次遍历堆栈" << endl;
    Traverse(s);
    GetTop(s);
    Clear(s);
}
```

先不要急着一行行硬读，先把这段程序当成“用单链表模拟一摞盘子”。

#### 1. 这段程序到底在做什么

- 每输入一个字符，就把它压到栈顶
- 遍历时，输出的是“从栈顶到栈底”的顺序
- 弹出一个元素后，再次遍历，就能看到栈内容发生了变化

如果输入的是：`a b c d e`

那么压栈过程是：

- 先放入 `a`
- 再放入 `b`，`b` 在上面
- 再放入 `c`，`c` 在更上面
- 最后栈顶是 `e`

所以遍历时看到的大概率是：`e d c b a`

这正是栈“后进先出”的体现。

#### 2. 先认识几个你必须懂的语法

```cpp
typedef struct ENode
{
    char data;
    struct ENode *next;
} Node, *Stack;
```

这几行初学者最容易懵，可以拆开理解：

- `Node` 是一种结点类型
- 每个结点里有两部分：
  - `data`：真正存的数据，这里是一个字符
  - `next`：指向下一个结点的指针
- `Stack` 其实不是“整个栈”，而是“指向栈顶结点的指针类型`

也就是说：

- `Node` 像一个小盒子
- `next` 像盒子上贴的一张纸条，写着“下一个盒子在哪”
- `Stack s;` 的 `s` 更像“当前最上面那个盒子的地址”

再看函数参数：

- `Stack s`：传进去的是当前指针的值，函数里改它，不会影响原来的栈顶
- `Stack &s`：这里的 `&` 表示引用，函数里改 `s`，外面的栈顶也会一起变

所以像 `Push`、`Pop` 这种会改变栈顶的函数，一定要写成 `Stack &s`。

#### 3. 每个函数各自负责什么

- `Init(s)`：把栈置空，让 `s = NULL`
- `Empty(s)`：判断栈是不是空
- `Length(s)`：顺着链表往下数，一共几个结点
- `GetTop(s)`：读取栈顶元素，也就是 `s->data`
- `Traverse(s)`：从栈顶一路往下输出所有元素
- `Push(s, e)`：把新元素压到栈顶
- `Pop(s, e)`：把栈顶元素弹出，并存到 `e` 里
- `Clear(s)` / `Destory(s)`：把所有结点释放掉

#### 4. `Push` 为什么就是入栈

先看代码：

```cpp
void Push(Stack &s, char e)
{
    Stack t = new Node;
    t->data = e;
    t->next = s;
    s = t;
}
```

把这 4 行翻成白话：

1. `new Node`：申请一个新结点，名字叫 `t`
2. `t->data = e`：把要入栈的字符放进这个新结点
3. `t->next = s`：让新结点指向“原来的栈顶”
4. `s = t`：把栈顶改成这个新结点

假设原来栈是：

```text
s -> [b] -> [a] -> NULL
```

现在执行 `Push(s, 'c')` 后：

```text
s -> [c] -> [b] -> [a] -> NULL
```

所以新元素永远插在最前面，这就叫“头插法”。链栈正是利用头插法来实现入栈。

#### 5. `Pop` 为什么就是出栈

```cpp
int Pop(Stack &s, char &e)
{
    Stack p = s;
    if(s == NULL) return 0;
    e = s->data;
    s = s->next;
    delete p;
    return 1;
}
```

翻成白话：

1. `p = s`：先记住“原来的栈顶是谁”
2. 如果栈空，就失败返回 `0`
3. `e = s->data`：把栈顶元素取出来
4. `s = s->next`：让栈顶往下移一层
5. `delete p`：释放刚才那个旧栈顶结点

假设原来是：

```text
s -> [c] -> [b] -> [a] -> NULL
```

执行一次 `Pop` 后：

- 取出的元素是 `c`
- 栈变成：

```text
s -> [b] -> [a] -> NULL
```

这就是“后进先出”。最后压进去的 `c`，最先出来。

#### 6. 主函数在干什么

```cpp
for(i=0;i<5;i++)
{
    cin>>c;
    Push(s,c);
}
Traverse(s);
cout<<"弹出一个元素"<<endl;
Pop(s,c);
cout<<c;
cout<<"再次遍历堆栈"<<endl;
Traverse(s);
```

这段流程可以理解成：

- 连续输入 5 个字符
- 每输入一个就压栈
- 全部输入完后输出整个栈
- 再弹出一个栈顶元素并输出它
- 然后再次输出现在的栈

如果输入顺序是：`a b c d e`

那么过程如下：

```text
压入 a: s -> a
压入 b: s -> b -> a
压入 c: s -> c -> b -> a
压入 d: s -> d -> c -> b -> a
压入 e: s -> e -> d -> c -> b -> a
```

第一次 `Traverse` 输出：

```text
e d c b a
```

执行 `Pop` 后：

- 弹出的元素是 `e`
- 栈变成 `d c b a`

第二次 `Traverse` 输出：

```text
d c b a
```

#### 7. 初学者最容易卡住的点

- `s` 不是一串完整数据，它只是“指向栈顶的指针”
- `s->data` 的意思是“取 s 所指向结点里的 data”
- `new Node` 是“申请一个新结点空间”
- `delete p` 是“把不用的结点还给系统”
- 链栈的遍历方向是从栈顶往栈底，不是从输入顺序往后看

#### 8. 这个示例你至少要记住什么

- 链栈本质上就是“在单链表表头做插入和删除”
- 入栈就是头插法
- 出栈就是删除首结点
- 栈顶永远是链表第一个结点

### 示例2：循环顺序队列基本操作（`3-2.cpp`）

这个程序演示了循环队列的初始化、入队、取队头、取队尾和求长度。它最大的学习重点不是代码长相，而是 `front`、`rear` 和 `%` 取模到底代表什么。

```cpp
#define MAXSIZE 100
#include "iostream.h"

typedef struct {
    char *elem;
    int front;
    int rear;
} SqQueue;

int Init(SqQueue &q) {
    q.elem = new char[MAXSIZE];
    if (q.elem == NULL)
        return 0;
    q.front = q.rear = 0;
    return 1;
}

int Length(SqQueue q) {
    return (q.rear - q.front + MAXSIZE) % MAXSIZE;
}

int Empty(SqQueue q) {
    return q.rear == q.front;
}

int Full(SqQueue q) {
    return (q.rear + 1) % MAXSIZE == q.front;
}

char GetHead(SqQueue q) {
    return q.elem[q.front];
}

char GetTail(SqQueue q) {
    return q.elem[(q.rear - 1 + MAXSIZE) % MAXSIZE];
}

int EnQueue(SqQueue &q, char e) {
    if (Full(q))
        return 0;
    q.elem[q.rear] = e;
    q.rear = (q.rear + 1) % MAXSIZE;
    return 1;
}

int DeQueue(SqQueue &q, char &e) {
    if (Empty(q))
        return 0;
    e = q.elem[q.front];
    q.front = (q.front + 1) % MAXSIZE;
    return 1;
}

void main() {
    SqQueue q;
    int i;
    char c;
    Init(q);
    for (i = 0; i < 5; i++) {
        cin >> c;
        EnQueue(q, c);
    }
    c = GetHead(q);
    cout << c << endl;
    c = GetTail(q);
    cout << c << endl;
    cout << Length(q);
}
```

#### 1. 先把队列想成“排队”

队列最像生活里的排队：

- 新来的人只能排到队尾
- 已经在最前面的人才能先离开

所以：

- `front`：队头，在最前面，谁该出队就看它
- `rear`：队尾的后一个位置，新元素要放到这里

注意这里很关键：

<div class="callout callout-warning">
<b>`rear` 不是最后一个元素本身，而是“下一个可以放新元素的位置”。</b>
</div>

#### 2. 先认识结构体长什么样

```cpp
typedef struct 
{
    char *elem;
    int front;
    int rear;
} SqQueue;
```

这里可以理解成：

- `elem`：一整块数组空间，用来存队列元素
- `front`：队头下标
- `rear`：队尾后一个位置的下标

#### 3. 初始化为什么是 `front = rear = 0`

```cpp
q.front = q.rear = 0;
```

这表示：

- 队列刚开始一个元素都没有
- 队头和队尾后一个位置重合

所以空队列判定就是：

```cpp
q.rear == q.front
```

#### 4. 入队到底做了哪两步

```cpp
q.elem[q.rear] = e;
q.rear = (q.rear + 1) % MAXSIZE;
```

白话翻译：

1. 把新元素放到 `rear` 指向的位置
2. `rear` 向后移动一格

如果 `rear` 已经走到数组最后一个位置，下一步就要回到开头。所以才需要：

```cpp
(q.rear + 1) % MAXSIZE
```

这里的 `%` 可以简单理解成“绕一圈”。

例如数组大小 `MAXSIZE = 100`：

- 如果 `rear = 8`，下一格是 `9`
- 如果 `rear = 99`，下一格就不是 `100`，而是 `0`

#### 5. 出队做了哪两步

```cpp
e = q.elem[q.front];
q.front = (q.front+1) % MAXSIZE;
```

白话翻译：

1. 取出队头元素
2. 让队头往后走一格

这很像排队最前面的人离开后，下一位自然补到最前面。

#### 6. 为什么叫“循环队列”

普通顺序队列只会一直往数组后面走，走到最后就算前面空了，也很难继续用，于是会出现“假溢出”。

循环队列的改进就是：

- 走到数组尾部后，再从开头继续用
- 这样前面被出队腾出来的位置就能再次使用

所以它本质上是“首尾相接的数组队列”。

#### 7. 关键函数怎么理解

- `Empty(q)`：队空时 `front == rear`
- `Full(q)`：队满时 `(rear + 1) % MAXSIZE == front`
- `GetHead(q)`：取队头元素 `q.elem[q.front]`
- `GetTail(q)`：取队尾元素 `q.elem[(q.rear-1+MAXSIZE)%MAXSIZE]`

其中 `GetTail` 最难理解。因为 `rear` 指向的不是最后一个元素，而是“最后一个元素后面的位置”，所以要先退一格。

#### 8. 用一个小例子手动跑一遍

假设依次入队：`a b c d e`

初始时：

```text
front = 0, rear = 0
```

入队 `a` 后：

- `a` 放在 `elem[0]`
- `rear` 变成 `1`

入队 `b` 后：

- `b` 放在 `elem[1]`
- `rear` 变成 `2`

一直到入队 `e`：

```text
elem[0]=a, elem[1]=b, elem[2]=c, elem[3]=d, elem[4]=e
front=0, rear=5
```

此时：

- 队头是 `a`
- 队尾是 `e`
- 长度是 `5`

这正对应主函数最后三次输出的内容。

#### 9. 这段代码你至少要记住什么

- `front` 看队头，`rear` 看下一次入队位置
- 入队改 `rear`，出队改 `front`
- `% MAXSIZE` 是为了让数组“转圈使用”
- 判满时故意空一个位置，这是教材里最常见的写法

### 示例3：链栈的再次出栈与长度验证（`3-3.cpp`）

这个程序与示例1结构接近，但增加了多次出栈和最后求长度的过程，更适合观察栈状态变化。你可以把它看成是"链栈练习加强版"。

```cpp
#include "iostream.h"

typedef struct ENode {
    char data;
    struct ENode *next;
} Node, *Stack;

void Init(Stack &s) {
    s = NULL;
}

void Destory(Stack &s) {
    Stack p;
    while (s != NULL) {
        p = s->next;
        delete s;
        s = p;
    }
}

void Clear(Stack &s) {
    Destory(s);
}

int Empty(Stack s) {
    return s == NULL;
}

int Length(Stack s) {
    int k = 0;
    while (s != NULL) {
        k++;
        s = s->next;
    }
    return k;
}

char GetTop(Stack s) {
    return s->data;
}

void Traverse(Stack s) {
    while (s != NULL) {
        cout << s->data << "  ";
        s = s->next;
    }
}

void Push(Stack &s, char e) {
    Stack t = new Node;
    t->data = e;
    t->next = s;
    s = t;
}

int Pop(Stack &s, char &e) {
    Stack p = s;
    if (s == NULL) return 0;
    e = s->data;
    s = s->next;
    delete p;
    return 1;
}

void main() {
    int i = 0;
    char c;
    Stack s;
    Init(s);
    Clear(s);
    for (i = 0; i < 5; i++) {
        cin >> c;
        Push(s, c);
    }
    Traverse(s);
    cout << "弹出一个元素" << endl;
    Pop(s, c);
    cout << c;
    cout << "再次遍历堆栈" << endl;
    Traverse(s);
    GetTop(s);
    Pop(s, c);
    cout << endl;
    cout << c;
    cout << endl;
    Traverse(s);
    Clear(s);
    cout << endl;
    cout << Length(s);
}
```

#### 1. 这份代码和示例1有什么不同

主体结构和示例1几乎一样，重点差在主函数后半段：

- 它不只弹出一次
- 它在多次操作后又做了遍历
- 它最后清空栈后，又调用 `Length(s)` 检查长度

所以这份代码更适合你观察：“每做一次 `Pop`，栈里到底少了谁”。

#### 2. 建议你只盯住主函数

```cpp
Traverse(s);
Pop(s,c);
Traverse(s);
Pop(s,c);
Traverse(s);
Clear(s);
cout<<Length(s);
```

你可以把它当成下面的实验：

1. 先看栈当前长什么样
2. 弹出一次，再看一遍
3. 再弹出一次，再看一遍
4. 最后全部清空，看看长度是不是 `0`

#### 3. 还是用 `a b c d e` 举例

全部压栈后：

```text
e d c b a
```

第一次 `Pop`：

- 弹出 `e`
- 栈变成 `d c b a`

第二次 `Pop`：

- 弹出 `d`
- 栈变成 `c b a`

执行 `Clear(s)` 后：

- 所有结点都会被释放
- `s` 最终变成 `NULL`
- `Length(s)` 结果是 `0`

#### 4. 这份程序主要帮你建立什么感觉

- 栈不是“静态不变的一组数据”，而是会随 `Push` 和 `Pop` 不断变化
- `Pop` 不是只把值拿出来，还会真正删掉最上面的结点
- `Clear` 后，栈就彻底空了，不只是“看起来不输出东西”

#### 5. 这份代码你至少要记住什么

- 多次出栈时，每次都是当前栈顶先出去
- `Length` 对链栈来说必须遍历计算
- `Clear` 本质上是把整条链表逐个释放

### 示例4：链队列信息管理案例（`3-4.cpp`）

这个程序把链队列应用到了一个简单的信息收集、查看和删除场景中。它比前几个例子难很多，建议你先把它当成"看懂队列思想"，不要一上来要求自己把每个细节都吃透。

```cpp
#define MAXNUM 70
#define FALSE 0
#define TRUE 1

#include "stdio.h"
#include "stdlib.h"
#include "string.h"

typedef struct Qnode {
    char data[MAXNUM];
    struct Qnode *next;
} Qnodetype;

typedef struct {
    Qnodetype *front;
    Qnodetype *rear;
    int number;
} Lqueue;

int initLqueue(Lqueue **q) {
    if (((*q)->front = (Qnodetype*)malloc(sizeof(Qnodetype))) == NULL)
        return FALSE;
    (*q)->rear = (*q)->front;
    strcpy((*q)->front->data, "head");
    (*q)->front->next = NULL;
    (*q)->number = 0;
    return TRUE;
}

int LInQueue(Lqueue *q, char x[]) {
    Qnodetype *p;
    if ((p = (Qnodetype*)malloc(sizeof(Qnodetype))) == NULL)
        return FALSE;
    strcpy(p->data, x);
    p->next = NULL;
    q->rear->next = p;
    q->rear = p;
    return TRUE;
}

char* LOutQueue(Lqueue *q) {
    char x[MAXNUM];
    Qnodetype *p;
    if (q->front->next == NULL) return NULL;
    p = q->front->next;
    q->front->next = p->next;
    if (p->next == NULL) q->rear = q->front;
    strcpy(x, p->data);
    free(p);
    return x;
}

void get(Lqueue *q, char x[]) {
    int n;
    if (q->number == 20) {
        LOutQueue(q);
        q->number--;
    }
    LInQueue(q, x);
    q->number++;
}

void deleteall(Lqueue *q) {
    while (q->front != q->rear)
        LOutQueue(q);
    q->number = 0;
}

void deleteone(Lqueue *q, int n) {
    Lqueue *p;
    Qnodetype *s;
    int i;
    p = q;
    i = 1;
    while (i < n) {
        p->front = p->front->next;
        i = i + 1;
    }
    s = p->front->next;
    p->front->next = p->front->next->next;
    free(s);
    q->number--;
}

void displayall(Lqueue *q) {
    Lqueue *p;
    char x[MAXNUM];
    p = q;
    while (p->front != q->rear) {
        p->front = p->front->next;
        printf("%s\n", p->front->data);
    }
    printf("\n");
}

void displayone(Lqueue *q, int n) {
    Lqueue *p;
    Qnodetype *s;
    int i;
    p = q;
    i = 1;
    while (i < n) {
        p->front = p->front->next;
        i = i + 1;
    }
    s = p->front->next;
    printf("%s\n", s->data);
}

void main() {
    Lqueue *Lp;
    int i;
    Qnodetype *headnode;
    char command, ch[MAXNUM];
    initLqueue(&Lp);
    headnode = Lp->front;

    while (1) {
        printf("Get information(%d), please enter R\n", Lp->number);
        printf("Display one information(%d), please enter L\n", Lp->number);
        printf("Display all information(%d), please enter A\n", Lp->number);
        printf("Delete one information(%d), please enter D\n", Lp->number);
        printf("Delete all information(%d), please enter U\n", Lp->number);
        printf("Quit, please enter Q\n");
        printf("please input command:");
        scanf("%c", &command);
        switch (command) {
            case 'r':
            case 'R':
                gets(ch);
                Lp->front = headnode;
                get(Lp, ch);
                break;

            case 'l':
            case 'L':
                printf("enter No.:");
                scanf("%d", &i);
                Lp->front = headnode;
                displayone(Lp, i);
                break;

            case 'a':
            case 'A':
                Lp->front = headnode;
                displayall(Lp);
                break;

            case 'd':
            case 'D':
                printf("enter No.:");
                scanf("%d", &i);
                Lp->front = headnode;
                deleteone(Lp, i);
                break;

            case 'u':
            case 'U':
                Lp->front = headnode;
                deleteall(Lp);
                break;

            case 'q':
            case 'Q':
                printf("quit!");
        }
        if (command == 'q' || command == 'Q') break;
    }
}
```

#### 1. 这份程序想解决什么问题

它模拟了一个“信息排队处理”的小系统，能做这些事：

- 接收一条新信息
- 查看第 `n` 条信息
- 查看全部信息
- 删除第 `n` 条信息
- 清空全部信息

你可以把它想成一个“最多保留 20 条记录的小消息队列”。

#### 2. 先抓住最核心的数据结构

```cpp
typedef struct Qnode
{
    char data[MAXNUM];
    struct Qnode *next;
} Qnodetype;
```

这表示每个结点里放的是一个字符串，而不是单个字符或整数。

```cpp
typedef struct 
{ 
    Qnodetype *front;
    Qnodetype *rear; 
    int number;
} Lqueue;
```

这里：

- `front`：队头指针
- `rear`：队尾指针
- `number`：当前队列里有几条信息

#### 3. 你只需要先看懂两个核心函数

##### 入队：`LInQueue`

```cpp
q->rear->next = p;
q->rear = p;
```

意思很简单：

1. 原来的队尾结点后面接上新结点 `p`
2. 队尾指针后移，改成指向 `p`

这就是链队列的标准入队动作。

##### 出队：`LOutQueue`

```cpp
p = q->front->next;
q->front->next = p->next;
if (p->next == NULL) q->rear = q->front;
free(p);
```

意思是：

1. 找到第一个真正的数据结点 `p`
2. 让头结点直接跳过它，接到下一个结点上
3. 如果删掉的是最后一个数据结点，就把 `rear` 调回头结点
4. 释放这个被删结点

#### 4. `get` 函数为什么很像“消息缓冲区”

```cpp
if (q->number == 20)
{
    LOutQueue(q);
    q->number--;
}
LInQueue(q, x);
q->number++;
```

这段逻辑非常值得记：

- 如果已经满 20 条，就先删掉最旧的一条
- 然后把新信息放进来

这其实就是一个“先进先出的固定容量缓冲区”。

生活里可以把它理解成：

- 留言板最多显示 20 条
- 新留言来了，最早那条先被挤掉

#### 5. 为什么这份代码难读

因为它不只是基础队列操作，还掺杂了：

- 字符串处理
- 菜单交互
- 按编号显示或删除
- 比较早期的 C 写法

所以真正的学习顺序应该是：

1. 先只看它怎么入队、怎么出队
2. 再看 `number` 怎么控制上限
3. 最后再看菜单部分

#### 6. 这份代码里有哪些地方你先知道就好

- `malloc` / `free`：和 `new` / `delete` 类似，都是申请和释放内存
- `strcpy`：把字符串复制到字符数组里
- `scanf`、`printf`：标准输入输出
- `switch`：根据用户输入的命令执行不同操作

#### 7. 这份程序你真正要学到什么

- 链队列不只能存数字，也可以存字符串、记录等更复杂的数据
- 队列特别适合处理“按先后顺序进入、按先后顺序淘汰”的问题
- 当你觉得代码太长时，要先找“入队”和“出队”这两个核心动作

#### 8. 补充说明

你说得对，这类代码来自 Windows XP / 旧教材环境很常见，所以编码问题本身不用纠结。真正需要注意的是：这段代码里有一些老式写法和不够安全的写法，适合作为课堂示例，不适合作为现代工程模板直接照搬。

### 示例5：链队列整数入队出队（`3-6.cpp`）

这个程序是较为简洁的链队列实现，适合用来理解队头和队尾指针的变化。相比示例4，它更适合初学者入门。

```cpp
#include <stdio.h>
#include <stdlib.h>

typedef struct Node {
    int data;
    struct Node* next;
} Node;

typedef struct {
    Node* front;
    Node* rear;
} Queue;

void initQueue(Queue* q) {
    q->front = q->rear = NULL;
}

void enqueue(Queue* q, int value) {
    Node* newNode = (Node*)malloc(sizeof(Node));
    if (!newNode) {
        printf("Memory allocation failed.\n");
        return;
    }
    newNode->data = value;
    newNode->next = NULL;
    if (q->rear == NULL) {
        q->front = q->rear = newNode;
    } else {
        q->rear->next = newNode;
        q->rear = newNode;
    }
}

int dequeue(Queue* q) {
    if (q->front == NULL) {
        printf("Queue is empty.\n");
        return -1;
    }
    Node* temp = q->front;
    int data = temp->data;
    q->front = q->front->next;
    free(temp);
    if (q->front == NULL) {
        q->rear = NULL;
    }
    return data;
}

int isEmpty(Queue* q) {
    return q->front == NULL;
}

void main() {
    Queue q;
    initQueue(&q);
    enqueue(&q, 10);
    enqueue(&q, 20);
    printf("Dequeued: %d\n", dequeue(&q));
    printf("Dequeued: %d\n", dequeue(&q));
    if (isEmpty(&q)) {
        printf("Queue is empty.\n");
    } else {
        printf("Queue is not empty.\n");
    }
}
```

#### 1. 这份代码为什么推荐先看

因为它只做最核心的事：

- 初始化队列
- 入队
- 出队
- 判断空队列

没有复杂菜单，也没有字符串处理，所以特别适合第一次接触链队列的人。

#### 2. 结构体到底表示什么

```cpp
typedef struct Node 
{
    int data;
    struct Node* next;
} Node;
```

这是链表结点：

- `data` 存整数
- `next` 指向下一个结点

```cpp
typedef struct 
{
    Node* front;
    Node* rear;
} Queue;
```

这是整个队列：

- `front` 指向队头结点
- `rear` 指向队尾结点

#### 3. 初始化为什么都设成 `NULL`

```cpp
q->front = q->rear = NULL;
```

这表示现在连一个结点都没有，所以：

- 队头不存在
- 队尾也不存在

#### 4. 入队为什么要分两种情况

```cpp
if (q->rear == NULL)
{
    q->front = q->rear = newNode;
}
else
{
    q->rear->next = newNode;
    q->rear = newNode;
}
```

这是因为“空队列”和“非空队列”不一样。

##### 情况一：原来是空队列

一个元素入队后，它既是队头，也是队尾，所以：

```text
front = rear = newNode
```

##### 情况二：原来不是空队列

那就把新结点接到原队尾后面，再更新队尾：

```text
原来: front -> [10] -> [20]
入队30后: front -> [10] -> [20] -> [30]
                              ^
                             rear
```

#### 5. 出队为什么也要特别判断

```cpp
Node* temp = q->front;
int data = temp->data;
q->front = q->front->next;
free(temp);
if (q->front == NULL)
{
    q->rear = NULL;
}
```

前面几步都不难：

1. 记住原队头
2. 取出它的数据
3. 队头后移
4. 释放旧队头

最关键的是最后的判断：

- 如果队头已经变成 `NULL`
- 说明最后一个结点也被删掉了
- 这时队尾也必须一起改成 `NULL`

不然就会出现“队列明明空了，但 `rear` 还指着旧地址”的错误。

#### 6. 用程序里的数据手动跑一遍

主函数里做的是：

```cpp
enqueue(&q, 10);
enqueue(&q, 20);
dequeue(&q);
dequeue(&q);
```

过程如下：

第一步，入队 `10`：

```text
front -> [10] <- rear
```

第二步，入队 `20`：

```text
front -> [10] -> [20] <- rear
```

第三步，出队一次：

- 取出 `10`
- 队列变成：

```text
front -> [20] <- rear
```

第四步，再出队一次：

- 取出 `20`
- 队列变空：

```text
front = NULL, rear = NULL
```

所以最后 `isEmpty(&q)` 返回真。

#### 7. 这份代码你至少要记住什么

- 链队列入队是在尾部接新结点
- 出队是在头部删结点
- 第一个入队元素会同时成为 `front` 和 `rear`
- 最后一个元素出队后，`front` 和 `rear` 都要变成 `NULL`

### 示例6：循环顺序队列整数示例（`3-7.cpp`）

这个程序用整型数组实现循环队列，展示了入队、出队、取队头等操作。它和示例2本质一样，只是写法更接近现在常见的 C/C++ 教学代码。

```cpp
#include <stdio.h>
#include <stdlib.h>

#define MAX_SIZE 100

typedef struct {
    int data[MAX_SIZE];
    int front;
    int rear;
} Queue;

void initQueue(Queue *q) {
    q->front = 0;
    q->rear = 0;
}

bool isEmpty(Queue *q) {
    return q->front == q->rear;
}

bool isFull(Queue *q) {
    return (q->rear + 1) % MAX_SIZE == q->front;
}

bool enqueue(Queue *q, int element) {
    if (isFull(q)) {
        return false;
    }
    q->data[q->rear] = element;
    q->rear = (q->rear + 1) % MAX_SIZE;
    return true;
}

bool dequeue(Queue *q, int *element) {
    if (isEmpty(q)) {
        return false;
    }
    *element = q->data[q->front];
    q->front = (q->front + 1) % MAX_SIZE;
    return true;
}

bool getFront(Queue *q, int *element) {
    if (isEmpty(q)) {
        return false;
    }
    *element = q->data[q->front];
    return true;
}

void main() {
    Queue q;
    initQueue(&q);
    enqueue(&q, 10);
    enqueue(&q, 20);
    int frontElement;
    if (getFront(&q, &frontElement)) {
        printf("Front element: %d\n", frontElement);
    } else {
        printf("Queue is empty.\n");
    }
    int dequeuedElement;
    if (dequeue(&q, &dequeuedElement)) {
        printf("Dequeued element: %d\n", dequeuedElement);
        printf("New front element: %d\n", frontElement);
    } else {
        printf("Queue is empty.\n");
    }
}
```

#### 1. 这份代码和示例2有什么关系

如果你已经大致看懂示例2，那么这份代码其实是在重复同一件事：

- 用数组实现队列
- 用 `front` 和 `rear` 管理队头队尾
- 用 `% MAX_SIZE` 实现“循环”

不同点主要是：

- 它存的是 `int`
- 它用了 `bool` 返回成功或失败
- 它把函数名字写得更直白一些

#### 2. `bool` 返回值是什么意思

例如：

```cpp
bool enqueue(Queue *q, int element)
```

表示这个函数执行后，会返回：

- `true`：成功
- `false`：失败

所以这份代码比返回 `0/1` 更直观一点。

#### 3. 先盯住三个函数

##### `enqueue`

```cpp
q->data[q->rear] = element;
q->rear = (q->rear + 1) % MAX_SIZE;
```

意思是：

- 把元素放进 `rear` 指向的位置
- 然后让 `rear` 后移一格

##### `dequeue`

```cpp
*element = q->data[q->front];
q->front = (q->front + 1) % MAX_SIZE;
```

意思是：

- 从队头取出一个元素
- 再让 `front` 往后移动

##### `getFront`

```cpp
*element = q->data[q->front];
```

意思是：只看当前队头是谁，但不把它删掉。

#### 4. 为什么参数里有 `int *element`

这说明函数不只是“知道队头是什么”，还要把值带回给主函数。

可以理解成：

- 主函数准备了一个变量 `frontElement`
- 把它的地址传给函数
- 函数把结果写回那个变量里

所以：

```cpp
getFront(&q, &frontElement)
```

意思就是“请把队头元素写到 `frontElement` 里”。

#### 5. 用主函数手动模拟一遍

主函数里：

```cpp
enqueue(&q, 10);
enqueue(&q, 20);
```

此时队列可以理解成：

```text
[10, 20]
front = 0
rear = 2
```

执行：

```cpp
getFront(&q, &frontElement)
```

得到：

```text
frontElement = 10
```

然后执行：

```cpp
dequeue(&q, &dequeuedElement)
```

得到：

- `dequeuedElement = 10`
- `front` 后移
- 现在真正的队头应该变成 `20`

#### 6. 这个程序里有个小问题

程序写的是：

```cpp
printf("New front element: %d\n", frontElement);
```

但这里的 `frontElement` 还是出队前保存的旧值，也就是 `10`。如果真的想输出“新的队头元素”，应该再调用一次：

```cpp
getFront(&q, &frontElement);
```

然后再打印，这样才会得到 `20`。

#### 7. 这份代码你至少要记住什么

- 它本质上就是示例2的整型版本
- `getFront` 是“查看”，`dequeue` 是“删除并取出`
- 指针参数 `int *element` 的作用是把结果带回函数外面
- 出队后如果想看新的队头，要重新调用 `getFront`

---

## 本章小结

本章主要掌握以下内容：

1. 栈和队列本质上都是操作受限的线性表
2. 栈的特点是后进先出，队列的特点是先进先出
3. 栈可以采用顺序存储或链式存储实现
4. 队列可以采用循环顺序存储或链式存储实现
5. 循环队列是解决顺序队列假溢出的经典方法
6. 栈常用于递归、表达式、括号匹配，队列常用于缓冲、调度和排队处理

只要抓住“受限线性表”和“操作规则”这两个关键词，本章内容就不难理解。
