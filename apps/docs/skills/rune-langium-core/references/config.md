# Configuration

## RosettaQualifiableConfiguration

### Properties

#### $container

The container node in the AST; every node except the root node has a container.

**Type:** `RosettaModel`

**Required:** yes

#### $type

Every AST node has a type corresponding to what was specified in the grammar declaration.

**Type:** `"RosettaQualifiableConfiguration"`

**Required:** yes

#### qType



**Type:** `RosettaQualifiableType`

**Required:** yes

#### rosettaClass



**Type:** `Reference<Data>`

**Required:** yes

#### $containerProperty

The property of the `$container` node that contains this node. This is either a direct reference or an array.

**Type:** `string`

#### $containerIndex

In case `$containerProperty` is an array, the array index is stored here.

**Type:** `number`

#### $cstNode

The Concrete Syntax Tree (CST) node of the text range from which this node was parsed.

**Type:** `CstNode`

#### $document

The document containing the AST; only the root node has a direct reference to the document.

**Type:** `LangiumDocument<AstNode>`