#  Sunburst
**This is not an officially supported Google product.**

This diagram creates a [sunburst](https://en.wikipedia.org/wiki/Pie_chart#Ring_chart_.2F_Sunburst_chart_.2F_Multilevel_pie_chart) to display hierarchical data in a nested structure.

### What if I find an error? Suggestions for improvements?
Great! Marketplace content -- including visualizations -- were designed for continuous improvement through the help of the entire Looker community and we'd love your input. To report an error or improvement recommendation, please get in touch at help.looker.com to submit a request. Please be as detailed as possible in your explanation and we'll address it as quick as we can.


### Interested in extending the visualization for your own use case?
#### Quickstart Dev Instructions
1.  **Install Dependecies.**

    Using yarn, install all dependencies
    ```
    yarn
    ```
2. **Make changes to the source code**

    Source code can be found in:
    ```
    ./src/sunburst/sunburst.ts
    ```

3.  **Compile your code**

    You need to compile your typescript. Let's run:
    ```
    yarn build
    ```
    Recommended: Webpack can detect changes and build automatically
     ```
    yarn watch
    ```
    Your compiled code can be found in this directory as: `./sunburst.js`

**`sunburst.js`**: This visualization's minified distribution file. 

**`LICENSE`**: Looker's Marketplace content License file.

**`manifest.lkml`**: Looker's external dependencies configuration file. The visualization object is defined here.

**`marketplace.json`**: A JSON file containing information the marketplace installer uses to set up this project.

**`/src`**: This directory will contain all of the visualization's source code.

**`README.md`**: This! A text file containing useful reference information about this visualization.

**`yarn.lock`**: [Yarn](https://yarnpkg.com/) is a package manager alternative to npm. This file serves essentially the same purpose as `package-lock.json`, just for a different package management system.

**`tsconfig.json`**: A configuration file for the typescript -> javascript compiler.

